// Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
require('../js/data.js');
require('../js/sim.js');
const { sim, CONFIG } = globalThis.DCB;

function seeded(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

test('new game starts with money, offers and an empty floor', () => {
  const s = sim.newGame();
  assert.strictEqual(s.money, CONFIG.startMoney);
  assert.ok(s.offers.length >= 2);
  assert.ok(s.tiles.every((t) => t === null));
});

test('placing equipment costs money and respects floor bounds', () => {
  const s = sim.newGame();
  assert.ok(sim.place(s, 0, 0, 'rack').ok);
  assert.strictEqual(s.money, CONFIG.startMoney - 8000);
  assert.strictEqual(sim.place(s, 0, 0, 'rack').ok, false, 'occupied');
  assert.strictEqual(sim.place(s, 11, 7, 'rack').ok, false, 'locked area');
  assert.strictEqual(sim.place(s, 1, 0, 'gpu').ok, false, 'needs liquid upgrade');
});

test('uncooled rack overheats; cooled rack stays in ASHRAE range', () => {
  const s = sim.newGame();
  sim.setRandom(() => 0.99);
  s.timers.event = s.timers.quiz = 1e9;
  sim.place(s, 0, 0, 'rack');
  sim.place(s, 7, 4, 'rack');
  sim.place(s, 1, 0, 'crac');
  for (let i = 0; i < 20; i++) sim.tick(s);
  const cooled = s.tiles[0];
  const hot = s.tiles[4 * CONFIG.maxW + 7];
  assert.ok(cooled.temp < CONFIG.tempWarn, `cooled rack at ${cooled.temp}`);
  assert.ok(hot.temp > CONFIG.tempThrottle, `uncooled rack at ${hot.temp}`);
});

test('air cooling cannot fully cool a GPU rack but a CDU can', () => {
  const s = sim.newGame();
  s.money = 1e7;
  s.upgrades.liquid = true;
  sim.place(s, 0, 0, 'gpu');
  sim.place(s, 1, 0, 'crac');
  sim.place(s, 0, 1, 'crac');
  assert.ok(s.tiles[0].cool < 0.5);
  sim.place(s, 1, 1, 'cdu');
  assert.ok(s.tiles[0].cool > 0.99);
});

test('PUE is facility power over IT power', () => {
  const s = sim.newGame();
  sim.place(s, 0, 0, 'rack');
  sim.place(s, 1, 0, 'crac');
  const m = s.m;
  assert.ok(Math.abs(m.pue - m.facility / m.it) < 1e-9);
  assert.ok(m.pue > 1);
});

test('outage with UPS + generator causes no downtime', () => {
  sim.setRandom(seeded(1));
  const s = sim.newGame();
  s.timers.event = s.timers.quiz = 1e9;
  ['rack', 'crac', 'ups', 'generator', 'switch', 'storage'].forEach((t, i) => sim.place(s, i, 0, t));
  s.fx.outage = 0;
  sim.triggerEvent(s, 'outage');
  for (let i = 0; i < 6; i++) sim.tick(s);
  assert.strictEqual(s.fx.outage, 0);
  assert.strictEqual(s.fx.outageDown, 0);
  assert.ok(s.flags.survived);
});

test('outage without backup takes you dark', () => {
  sim.setRandom(seeded(2));
  const s = sim.newGame();
  s.timers.event = s.timers.quiz = 1e9;
  sim.place(s, 0, 0, 'rack');
  sim.triggerEvent(s, 'outage');
  sim.tick(s);
  assert.strictEqual(s.powered, false);
});

test('contracts need capacity, then pay out daily', () => {
  sim.setRandom(seeded(3));
  const s = sim.newGame();
  s.timers.event = s.timers.quiz = 1e9;
  s.offers = [];
  sim.genOffer(s);
  const o = s.offers[0];
  o.needs = null;
  assert.strictEqual(sim.acceptOffer(s, o.id).ok, false);
  ['rack', 'rack', 'crac', 'storage', 'switch'].forEach((t, i) => sim.place(s, i, 0, t));
  o.compute = 5; o.storage = 10; o.bw = 2;
  assert.ok(sim.acceptOffer(s, o.id).ok);
  const before = s.stats.revenue;
  for (let i = 0; i < 24; i++) sim.tick(s);
  assert.ok(s.stats.revenue > before);
  assert.ok(s.lastLedger);
});

test('long random simulation stays numerically sane', () => {
  sim.setRandom(seeded(42));
  const s = sim.newGame();
  s.money = 5e6;
  ['rack', 'rack', 'dense', 'crac', 'crac', 'ups', 'generator', 'switch', 'storage', 'firewall'].forEach((t, i) => sim.place(s, i % 8, Math.floor(i / 8), t));
  for (let i = 0; i < 24 * 90; i++) {
    sim.tick(s);
    while (s.pending.length) {
      const p = s.pending.shift();
      if (p.kind === 'quiz') sim.answerQuiz(s, p.q, 0);
      if (p.kind === 'event' && p.choices) sim.resolveChoice(s, p.id, 0);
    }
    if (s.offers.length) { const o = s.offers[0]; sim.acceptOffer(s, o.id); }
  }
  assert.ok(Number.isFinite(s.money));
  assert.ok(s.reputation >= 0 && s.reputation <= 100);
  assert.ok(s.m.uptime >= 0 && s.m.uptime <= 1);
  assert.ok(s.day > 90);
});

function richGame() {
  const s = sim.newGame();
  s.money = 1e7;
  s.timers.event = s.timers.quiz = 1e9;
  return s;
}

test('CRAHs only cool when a chiller plant makes chilled water', () => {
  const s = richGame();
  sim.place(s, 0, 0, 'dense');
  sim.place(s, 1, 0, 'crah');
  assert.ok(s.tiles[0].cool < 0.01, 'no plant, no cooling');
  assert.ok(s.m.plant.short);
  sim.place(s, 5, 4, 'chiller_wc');
  assert.ok(s.tiles[0].cool < 0.01, 'water-cooled chiller needs a tower');
  sim.place(s, 6, 4, 'tower');
  assert.ok(s.tiles[0].cool > 0.99);
  assert.ok(!s.m.plant.short);
  assert.ok(s.m.plant.kwPerTon > 0);
});

test('VFDs, BMS staging and a higher setpoint all cut plant energy', () => {
  const s = richGame();
  for (let x = 0; x < 6; x++) { sim.place(s, x, 0, 'dense'); sim.place(s, x, 2, 'dense'); }
  for (let x = 0; x < 6; x += 2) sim.place(s, x, 1, 'crah');
  sim.place(s, 0, 4, 'chiller_wc'); sim.place(s, 1, 4, 'tower'); sim.place(s, 2, 4, 'chiller_ac');
  const base = s.m.cooling;
  s.upgrades.vfd = true;
  const withVfd = sim.computeMetrics(s).cooling;
  assert.ok(withVfd < base);
  assert.strictEqual(sim.setSat(s, 25).ok, false, 'setpoint needs a BMS');
  sim.place(s, 3, 4, 'bms');
  const withBms = s.m.cooling;
  assert.ok(withBms < withVfd, 'BMS stages the efficient chiller first');
  assert.ok(sim.setSat(s, 25).ok);
  assert.ok(s.m.cooling < withBms);
  assert.strictEqual(s.m.sat, 25);
});

test('BMS alarms give technicians time to prevent failures', () => {
  const s = richGame();
  sim.place(s, 0, 0, 'rack'); sim.place(s, 1, 0, 'crac'); sim.place(s, 2, 0, 'bms');
  sim.setRandom(() => 0); // every failure roll hits
  sim.tick(s);
  sim.setRandom(() => 0.99);
  assert.ok(s.tiles.filter(Boolean).every((t) => t.status === 'ok'), 'alarm instead of instant failure');
  assert.ok(s.tiles[0].alarm > 0);
  for (let i = 0; i < 40; i++) sim.tick(s);
  assert.ok(s.log.some((l) => l.msg.includes('Preventive maintenance')));
});

test('fire suppression limits fire damage; clients can require it', () => {
  sim.setRandom(seeded(9));
  const a = richGame();
  const b = richGame();
  for (const s of [a, b]) for (let x = 0; x < 6; x++) sim.place(s, x, 0, 'rack');
  sim.place(b, 0, 1, 'suppression');
  sim.triggerEvent(a, 'fire');
  sim.triggerEvent(b, 'fire');
  const broken = (s) => s.tiles.filter((t) => t && t.status === 'broken').length;
  assert.ok(broken(a) > broken(b));
  assert.ok(a.fx.evac > 0 && b.fx.evac === 0);
  sim.computeMetrics(b);
  const offer = { needs: ['access', 'suppression'], compute: 1, storage: 0, bw: 0 };
  assert.match(sim.acceptCheck(b, offer), /Access Control/);
});

test('old saves are migrated', () => {
  const s = sim.newGame();
  delete s.controls; delete s.trend; delete s.fx.evac; delete s.fx.dr;
  s.quizOrder = s.quizOrder.filter((i) => i < 20);
  sim.migrate(JSON.parse(JSON.stringify(s)));
  const m = sim.migrate(s);
  assert.strictEqual(m.controls.sat, CONFIG.roomTemp);
  assert.strictEqual(new Set(m.quizOrder).size, globalThis.DCB.QUIZ.length);
});
