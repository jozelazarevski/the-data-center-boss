/* The Data Center Boss — simulation (no DOM). One tick = one in-game hour. */
(function (root) {
  const DCB = root.DCB;
  const C = DCB.CONFIG;
  const EQ = DCB.EQUIPMENT;
  const AIR_LIMIT = 15; // kW of heat air cooling can pull from a single rack
  const FLOOR_STEPS = [[8, 5], [10, 6], [12, 7], [12, 8]];
  const FLOOR_COSTS = [40000, 90000, 150000];

  let rand = Math.random;
  const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function shuffled(n) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function newGame() {
    const s = {
      version: 1,
      day: 1,
      hour: 8,
      money: C.startMoney,
      reputation: C.startRep,
      w: C.startW,
      h: C.startH,
      floorStep: 0,
      gridCap: C.startGrid,
      gridUpgrades: 0,
      tiles: new Array(C.maxW * C.maxH).fill(null),
      contracts: [],
      offers: [],
      upgrades: {},
      techs: 1,
      powered: true,
      onGenerator: false,
      fx: { outage: 0, outageElapsed: 0, outageDown: 0, outageCause: '', heatwave: 0, ddos: 0, fiber: 0, spike: 0, spikeShort: false, priceSpike: 0, sale: 0, ransom: 0 },
      timers: { offer: 2, event: 48, quiz: 20, fact: 6 },
      stats: { revenue: 0, capex: 0, opex: 0, energy: 0, carbon: 0, hours: 0, history: [], signed: 0, completed: 0, outagesSurvived: 0, quizRight: 0, quizTotal: 0 },
      ledger: emptyLedger(),
      lastLedger: null,
      flags: {},
      goals: {},
      pending: [],
      log: [],
      quizOrder: shuffled(DCB.QUIZ.length),
      quizPos: 0,
      nextId: 1,
      won: false,
      lost: false,
      m: {},
    };
    // Starter offers are small so a first rack can serve them.
    genOffer(s, 'bakery');
    genOffer(s, 'blog');
    genOffer(s);
    s.offers.forEach((o) => (o.expires += 24));
    log(s, 'Welcome, Boss! You have an empty room, $120,000 and big dreams.', 'info');
    computeMetrics(s);
    return s;
  }

  function emptyLedger() {
    return { revenue: 0, energy: 0, fuel: 0, salaries: 0, rent: 0, repairs: 0, penalties: 0 };
  }

  function timeLabel(s) {
    return `Day ${s.day} ${String(s.hour).padStart(2, '0')}:00`;
  }

  function log(s, msg, kind) {
    s.log.unshift({ t: timeLabel(s), msg, kind: kind || 'info' });
    if (s.log.length > 80) s.log.length = 80;
  }

  const idx = (x, y) => y * C.maxW + x;
  const inFloor = (s, x, y) => x >= 0 && y >= 0 && x < s.w && y < s.h;

  function outsideTemp(s) {
    // A 120-day "year" so the seasons actually change during play.
    const season = Math.sin((2 * Math.PI * (s.day - 1)) / 120);
    const daily = Math.sin((2 * Math.PI * (s.hour - 9)) / 24);
    return 12 + 10 * season + 4 * daily + (s.fx.heatwave > 0 ? 14 : 0);
  }

  function powerPrice(s) {
    if (s.upgrades.renewable) return 0.13;
    return C.powerPrice * (s.fx.priceSpike > 0 ? 3 : 1);
  }

  function priceOf(s, type) {
    return Math.round(EQ[type].cost * (s.fx.sale > 0 ? 0.75 : 1));
  }

  /* ---------- thermal model ---------- */
  function thermal(s, powered) {
    const up = s.upgrades;
    const mult = (up.containment ? 1.25 : 1) * (s.fx.heatwave > 0 ? 0.85 : 1);
    const sources = [];
    const coolers = [];
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      if (!t) continue;
      t.cool = 1;
      t.target = C.roomTemp;
      if (!powered || t.status !== 'ok') continue;
      const d = EQ[t.type];
      const heat = DCB.heatOf(d);
      const x = i % C.maxW;
      const y = Math.floor(i / C.maxW);
      if (heat > 0) sources.push({ t, x, y, heat, rem: heat, air: 0 });
      if (d.cooling) coolers.push({ d, x, y });
    }
    let electric = 0;
    let removed = 0;
    for (const c of coolers) {
      const cap = c.d.cooling * mult;
      const near = [];
      let sum = 0;
      for (const src of sources) {
        if (Math.max(Math.abs(src.x - c.x), Math.abs(src.y - c.y)) > c.d.radius) continue;
        const avail = c.d.liquid ? src.rem : Math.min(src.rem, Math.max(0, AIR_LIMIT - src.air));
        if (avail <= 0) continue;
        near.push([src, avail]);
        sum += avail;
      }
      if (sum <= 0) continue;
      const take = Math.min(cap, sum);
      const f = take / sum;
      for (const [src, avail] of near) {
        const x = avail * f;
        src.rem -= x;
        if (!c.d.liquid) src.air += x;
      }
      electric += take / c.d.cop;
      removed += take;
    }
    let factor = s.fx.heatwave > 0 ? 1.25 : 1;
    if (up.freeair) {
      const out = outsideTemp(s);
      factor *= out < 12 ? 0.4 : out < 20 ? 0.65 : out < 25 ? 0.85 : 1;
    }
    let unremoved = 0;
    for (const src of sources) {
      const u = src.rem / src.heat;
      src.t.cool = 1 - u;
      // Small heat sources barely warm up even when uncooled; a full rack cooks itself.
      src.t.target = C.roomTemp + 24 * u * Math.min(1, src.heat / 4) + (s.fx.heatwave > 0 ? 2 : 0) + (up.containment ? 0 : 1);
      unremoved += src.rem;
    }
    return { coolingKw: electric * factor, removed, unremoved };
  }

  /* ---------- metrics ---------- */
  function computeMetrics(s, assumePowered) {
    const powered = assumePowered || s.powered;
    const up = s.upgrades;
    const virt = up.virtualization ? 1.3 : 1;
    const m = {
      it: 0, aux: 0, cooling: 0, lights: C.lightsKw, facility: 0, pue: 0,
      computeCap: 0, storageCap: 0, bwCap: 0, computeInst: 0, storageInst: 0, bwInst: 0,
      upsCap: 0, genCap: 0, coolingCap: 0, firewall: 0, counts: {}, broken: 0, hot: 0, equipValue: 0,
    };
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      if (!t) continue;
      const d = EQ[t.type];
      m.counts[t.type] = (m.counts[t.type] || 0) + 1;
      m.equipValue += d.cost;
      m.computeInst += (d.compute || 0) * virt;
      m.storageInst += d.storage || 0;
      m.bwInst += d.bw || 0;
      if (d.security) m.firewall++;
      if (t.status !== 'ok') { m.broken++; continue; }
      if (!powered) continue;
      if (d.cat === 'compute' || d.cat === 'network') m.it += d.power;
      else m.aux += d.power + (d.idle || 0);
      const throttled = t.temp > C.tempThrottle;
      if (throttled) m.hot++;
      m.computeCap += (d.compute || 0) * virt * (throttled ? 0.5 : 1);
      m.storageCap += d.storage || 0;
      m.bwCap += d.bw || 0;
      m.upsCap += d.ups || 0;
      m.genCap += d.gen || 0;
      if (d.cooling) m.coolingCap += d.cooling * (up.containment ? 1.25 : 1);
    }
    const th = thermal(s, powered);
    m.cooling = th.coolingKw;
    m.unremoved = th.unremoved;
    if (!powered) m.lights = 0;
    m.facility = m.it + m.aux + m.cooling + m.lights;
    m.pue = m.it > 0 ? m.facility / m.it : 0;

    let dc = 0, ds = 0, db = 0;
    for (const c of s.contracts) { dc += c.compute; ds += c.storage; db += c.bw; }
    m.committedCompute = dc;
    m.committedStorage = ds;
    m.committedBw = db;
    m.demandCompute = dc * (s.fx.spike > 0 ? 1.4 : 1);
    m.demandStorage = ds;
    m.demandBw = db + (s.fx.ddos > 0 && db > 0 ? (m.firewall ? 5 : 40) : 0);
    if (s.fx.fiber > 0 && !up.dualfiber) m.bwCap = 0;

    const ratio = (cap, dem) => (dem <= 0 ? 1 : Math.min(1, cap / dem));
    m.availability = !powered || s.fx.ransom > 0
      ? 0
      : Math.min(ratio(m.computeCap, m.demandCompute), ratio(m.storageCap, m.demandStorage), ratio(m.bwCap, m.demandBw));
    m.outside = outsideTemp(s);
    m.price = powerPrice(s);
    const hist = s.stats.history;
    m.uptime = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : 1;
    m.dailyRevenue = s.contracts.reduce((a, c) => a + c.pay, 0);
    s.m = m;
    return m;
  }

  /* ---------- player actions ---------- */
  function canBuild(s, type) {
    const d = EQ[type];
    if (!d) return 'Unknown equipment.';
    if (d.requires && !s.upgrades[d.requires]) return `Requires the "${DCB.UPGRADES[d.requires].name}" upgrade.`;
    if (s.money < priceOf(s, type)) return 'Not enough money.';
    return null;
  }

  function place(s, x, y, type) {
    if (!inFloor(s, x, y)) return { ok: false, msg: 'That area is not part of your floor yet. Expand the floor first.' };
    const i = idx(x, y);
    if (s.tiles[i]) return { ok: false, msg: 'That tile is occupied.' };
    const err = canBuild(s, type);
    if (err) return { ok: false, msg: err };
    const cost = priceOf(s, type);
    s.money -= cost;
    s.stats.capex += cost;
    s.tiles[i] = { id: s.nextId++, type, status: 'ok', temp: C.roomTemp + 2, repair: 0, cool: 1, target: C.roomTemp };
    computeMetrics(s);
    checkGoals(s);
    return { ok: true, cost };
  }

  function sell(s, x, y) {
    const i = idx(x, y);
    const t = s.tiles[i];
    if (!t) return { ok: false, msg: 'Nothing here.' };
    const refund = Math.round(EQ[t.type].cost * (t.status === 'ok' ? 0.5 : 0.25));
    s.tiles[i] = null;
    s.money += refund;
    computeMetrics(s);
    return { ok: true, refund };
  }

  function buyUpgrade(s, id) {
    const u = DCB.UPGRADES[id];
    if (!u || s.upgrades[id]) return { ok: false, msg: 'Already owned.' };
    if (s.money < u.cost) return { ok: false, msg: 'Not enough money.' };
    s.money -= u.cost;
    s.stats.capex += u.cost;
    s.upgrades[id] = true;
    if (id === 'renewable') s.reputation = clamp(s.reputation + 5, 0, 100);
    log(s, `Upgrade installed: ${u.name}.`, 'good');
    computeMetrics(s);
    return { ok: true };
  }

  const gridUpgradeCost = (s) => Math.round(30000 * Math.pow(1.5, s.gridUpgrades));
  const floorUpgradeCost = (s) => (s.floorStep < FLOOR_COSTS.length ? FLOOR_COSTS[s.floorStep] : null);

  function upgradeGrid(s) {
    const cost = gridUpgradeCost(s);
    if (s.money < cost) return { ok: false, msg: 'Not enough money.' };
    s.money -= cost;
    s.stats.capex += cost;
    s.gridUpgrades++;
    s.gridCap += 150;
    log(s, `The utility upgraded your feed to ${s.gridCap} kW.`, 'good');
    computeMetrics(s);
    return { ok: true };
  }

  function expandFloor(s) {
    const cost = floorUpgradeCost(s);
    if (cost === null) return { ok: false, msg: 'Your building is already at maximum size.' };
    if (s.money < cost) return { ok: false, msg: 'Not enough money.' };
    s.money -= cost;
    s.stats.capex += cost;
    s.floorStep++;
    [s.w, s.h] = FLOOR_STEPS[s.floorStep];
    log(s, `Construction complete! Your floor is now ${s.w}×${s.h}.`, 'good');
    computeMetrics(s);
    return { ok: true };
  }

  function hire(s) {
    if (s.techs >= 10) return { ok: false, msg: 'Your team is full.' };
    if (s.money < 2000) return { ok: false, msg: 'Not enough money for the hiring fee.' };
    s.money -= 2000;
    s.techs++;
    log(s, `Hired a technician. Team size: ${s.techs}.`, 'good');
    return { ok: true };
  }

  function fire(s) {
    if (s.techs <= 0) return { ok: false, msg: 'Nobody to let go.' };
    s.techs--;
    log(s, `A technician left the team. Team size: ${s.techs}.`, s.techs === 0 ? 'bad' : 'info');
    return { ok: true };
  }

  /* ---------- clients ---------- */
  function genOffer(s, forced) {
    const eligible = DCB.CLIENTS.filter((c) => c.minRep <= s.reputation + 5);
    let total = 0;
    const weights = eligible.map((c) => { const w = 1 + c.minRep / 25; total += w; return w; });
    let r = rand() * total;
    let t = eligible[0];
    for (let i = 0; i < eligible.length; i++) { r -= weights[i]; if (r <= 0) { t = eligible[i]; break; } }
    if (forced) t = DCB.CLIENTS.find((c) => c.id === forced);
    const f = 0.8 + rand() * 0.5;
    const repMult = 0.85 + s.reputation / 200;
    s.offers.push({
      id: s.nextId++,
      tid: t.id,
      name: t.name,
      icon: t.icon,
      compute: Math.max(1, Math.round(t.compute * f)),
      storage: Math.round(t.storage * f),
      bw: Math.max(1, Math.round(t.bw * f)),
      sla: t.sla,
      needs: t.needs || null,
      pay: Math.round((t.pay * f * repMult) / 10) * 10,
      days: randInt(t.days[0], t.days[1]),
      expires: randInt(30, 60),
    });
  }

  function acceptCheck(s, o) {
    const m = s.m;
    if (o.needs === 'firewall' && !m.firewall) return 'This client requires a Firewall for security compliance.';
    const free = (inst, com) => Math.floor(inst - com);
    if (free(m.computeInst, m.committedCompute) < o.compute) return `Not enough compute: need ${o.compute}, you have ${free(m.computeInst, m.committedCompute)} free. Build more racks!`;
    if (free(m.storageInst, m.committedStorage) < o.storage) return `Not enough storage: need ${o.storage} TB, you have ${free(m.storageInst, m.committedStorage)} TB free. Build storage arrays!`;
    if (free(m.bwInst, m.committedBw) < o.bw) return `Not enough bandwidth: need ${o.bw} Gbps, you have ${free(m.bwInst, m.committedBw)} Gbps free. Add network switches!`;
    return null;
  }

  function acceptOffer(s, id) {
    const o = s.offers.find((x) => x.id === id);
    if (!o) return { ok: false, msg: 'Offer expired.' };
    const err = acceptCheck(s, o);
    if (err) return { ok: false, msg: err };
    s.offers = s.offers.filter((x) => x !== o);
    s.contracts.push({ ...o, daysLeft: o.days, hours: 0, down: 0, breached: false });
    s.stats.signed++;
    log(s, `Signed ${o.icon} ${o.name}: $${o.pay.toLocaleString()}/day for ${o.days} days at ${o.sla}% SLA.`, 'good');
    computeMetrics(s);
    checkGoals(s);
    return { ok: true };
  }

  function declineOffer(s, id) {
    s.offers = s.offers.filter((x) => x.id !== id);
  }

  /* ---------- events ---------- */
  function backupPlan(s) {
    const m = computeMetrics(s, true);
    const load = m.facility;
    return { load, ups: m.upsCap >= load && m.upsCap > 0, gen: m.genCap >= load && m.genCap > 0, m };
  }

  function outageOutcome(s) {
    const b = backupPlan(s);
    if (b.ups && b.gen) return 'Your UPS caught the load instantly and the generators roared to life. Clients will not notice a thing. 😎';
    if (b.gen) return 'Your generators will start, but with no UPS to bridge the ~15 second gap, every server crashes first. Expect some downtime and possibly damaged hardware.';
    if (b.ups) return 'Your UPS batteries will keep things running for a little while, but with no generator they will run dry. Everything shuts down after that.';
    if (s.m.upsCap || s.m.genCap) return `Your backup power is too small for your ${Math.round(b.load)} kW load! It will not help.`;
    return 'You have no backup power. Everything goes dark until the grid comes back, and the sudden power loss may damage hardware.';
  }

  function startOutage(s, hours, cause) {
    s.fx.outage = hours;
    s.fx.outageElapsed = 0;
    s.fx.outageDown = 0;
    s.fx.outageCause = cause;
  }

  function breakRandom(s, types) {
    const list = [];
    s.tiles.forEach((t, i) => { if (t && t.status === 'ok' && types.includes(t.type)) list.push(i); });
    if (!list.length) return null;
    const t = s.tiles[pick(list)];
    breakTile(s, t);
    return t;
  }

  function breakTile(s, t) {
    t.status = 'broken';
    t.repair = C.repairHours;
  }

  function triggerEvent(s, forced) {
    let id = forced;
    if (!id) {
      const ev = DCB.EVENTS;
      const ids = Object.keys(ev).filter((k) => {
        if (k === 'sale' && s.fx.sale > 0) return false;
        if (k === 'heatwave' && s.fx.heatwave > 0) return false;
        if ((k === 'spike' || k === 'ddos') && !s.contracts.length) return false;
        if ((k === 'outage' || k === 'squirrel') && s.fx.outage > 0) return false;
        return true;
      });
      let total = ids.reduce((a, k) => a + ev[k].weight, 0);
      let r = rand() * total;
      id = ids[ids.length - 1];
      for (const k of ids) { r -= ev[k].weight; if (r <= 0) { id = k; break; } }
    }
    const up = s.upgrades;
    let outcome = '';
    let kind = 'warn';
    switch (id) {
      case 'outage':
        outcome = outageOutcome(s);
        startOutage(s, randInt(2, 5), 'Storm');
        break;
      case 'squirrel':
        outcome = outageOutcome(s);
        startOutage(s, randInt(2, 3), 'Squirrel');
        break;
      case 'heatwave':
        s.fx.heatwave = 48;
        outcome = s.upgrades.containment
          ? 'Your aisle containment helps, but keep an eye on rack temperatures.'
          : 'Watch your rack temperatures closely. More cooling or aisle containment would help.';
        break;
      case 'ddos':
        s.fx.ddos = 6;
        outcome = s.m.firewall
          ? 'Your firewall is filtering most of the junk traffic. Only a trickle gets through.'
          : 'With no firewall, the attack is eating 40 Gbps of bandwidth for 6 hours! Spare bandwidth is your only defense.';
        break;
      case 'fiber':
        if (up.dualfiber) { outcome = 'Traffic instantly re-routed over your second carrier. Diverse paths FTW!'; kind = 'good'; }
        else { s.fx.fiber = 4; outcome = 'You have only one fiber path, so you are OFFLINE for about 4 hours while crews splice the cable.'; kind = 'bad'; }
        break;
      case 'disk': {
        const t = breakRandom(s, ['storage']) || breakRandom(s, ['rack', 'dense']);
        if (!t) { outcome = 'Luckily it was a spare drive on the shelf. No harm done.'; kind = 'info'; break; }
        if (up.raid) { outcome = `RAID kept all data safe. A technician will swap the part in the ${EQ[t.type].name}.`; kind = 'info'; }
        else {
          s.money -= 5000;
          s.ledger.penalties += 5000;
          s.reputation = clamp(s.reputation - 5, 0, 100);
          outcome = 'Without RAID, client data was lost! You paid $5,000 for data recovery, and your reputation took a hit (−5).';
          kind = 'bad';
        }
        break;
      }
      case 'ransomware':
        if (s.m.firewall) { outcome = 'Your firewall blocked the malware’s command server. Attack stopped! (+1 reputation)'; s.reputation = clamp(s.reputation + 1, 0, 100); kind = 'good'; }
        else if (up.raid) { s.fx.ransom = 3; s.reputation = clamp(s.reputation - 2, 0, 100); outcome = 'Systems got encrypted, but you restored from backups in about 3 hours. Never pay the ransom! (−2 reputation)'; }
        else { s.fx.ransom = 12; s.reputation = clamp(s.reputation - 10, 0, 100); outcome = 'No firewall, no backups… You are rebuilding systems from scratch for about 12 hours. (−10 reputation)'; kind = 'bad'; }
        break;
      case 'spike':
        s.fx.spike = 12;
        s.fx.spikeShort = false;
        outcome = 'If you have enough spare compute to stay at 100% for all 12 hours, the client will pay you a bonus!';
        kind = 'info';
        break;
      case 'pricespike':
        if (up.renewable) { outcome = 'Your fixed-price renewable PPA protects you. No extra cost!'; kind = 'good'; }
        else { s.fx.priceSpike = 72; outcome = `Power now costs $${(C.powerPrice * 3).toFixed(2)}/kWh. A low PUE hurts less.`; }
        break;
      case 'cosmic':
        outcome = 'ECC memory caught it. Just another day in the data center.';
        kind = 'info';
        break;
      case 'sale':
        s.fx.sale = 24;
        outcome = 'Go shopping! Prices in the build menu are 25% off.';
        kind = 'good';
        break;
      case 'journalist':
      case 'crypto':
        outcome = '';
        kind = 'info';
        break;
    }
    const e = DCB.EVENTS[id];
    log(s, `${e.icon} ${e.title}`, kind);
    s.pending.push({ kind: 'event', id, outcome, choices: e.choices || null });
    return id;
  }

  function resolveChoice(s, id, choice) {
    let msg = '';
    if (id === 'journalist') {
      if (choice === 0) {
        const m = s.m;
        if (m.broken || m.hot) {
          s.reputation = clamp(s.reputation - 4, 0, 100);
          msg = 'The article mentions "blinking red lights and suspiciously warm racks." Oops. (−4 reputation)';
        } else {
          s.reputation = clamp(s.reputation + 6, 0, 100);
          msg = 'Glowing review: "A spotless, well-run facility." (+6 reputation)';
        }
      } else msg = 'Security first. The journalist writes a short, neutral piece.';
    } else if (id === 'crypto') {
      if (choice === 0) {
        s.money += 15000;
        s.stats.carbon += 12000;
        s.reputation = clamp(s.reputation - 5, 0, 100);
        msg = '+$15,000, but green-minded clients noticed. (−5 reputation, +12 t CO₂)';
      } else {
        s.reputation = clamp(s.reputation + 1, 0, 100);
        msg = 'You kept your power for real customers. (+1 reputation)';
      }
    }
    log(s, msg, 'info');
    computeMetrics(s);
    return msg;
  }

  /* ---------- quiz ---------- */
  function nextQuiz(s) {
    const q = s.quizOrder[s.quizPos % s.quizOrder.length];
    s.quizPos++;
    s.pending.push({ kind: 'quiz', q });
  }

  function quizReward(s) {
    return 2000 + s.day * 100;
  }

  function answerQuiz(s, q, choice) {
    const Q = DCB.QUIZ[q];
    s.stats.quizTotal++;
    const correct = choice === Q.c;
    if (correct) {
      const r = quizReward(s);
      s.money += r;
      s.stats.quizRight++;
      s.reputation = clamp(s.reputation + 2, 0, 100);
      log(s, `Board quiz: correct! +$${r.toLocaleString()} and +2 reputation.`, 'good');
    } else {
      log(s, 'Board quiz: not quite. Check the Handbook to learn more.', 'warn');
    }
    return { correct, explain: Q.e, answer: Q.a[Q.c] };
  }

  /* ---------- goals ---------- */
  const GOAL_CHECKS = {
    first_rack: (s, m) => (m.counts.rack || 0) + (m.counts.dense || 0) + (m.counts.gpu || 0) > 0,
    cooled: (s) => s.tiles.some((t) => t && t.status === 'ok' && ['rack', 'dense', 'gpu'].includes(t.type) && t.cool > 0.98 && t.temp < C.tempWarn),
    first_client: (s) => s.stats.signed > 0,
    backup: (s, m) => m.counts.ups > 0 && m.counts.generator > 0,
    five_clients: (s) => s.contracts.length >= 5,
    pue15: (s, m) => s.powered && m.it >= 30 && m.pue < 1.5,
    rev100k: (s) => s.stats.revenue >= 100000,
    survive: (s) => !!s.flags.survived,
    four_nines: (s) => !!s.flags.fourNines,
    pue125: (s, m) => s.powered && m.it >= 100 && m.pue < 1.25,
    ai_host: (s) => s.contracts.some((c) => c.tid === 'ai'),
    millionaire: (s) => s.money >= C.winCash,
  };

  function checkGoals(s) {
    for (const g of DCB.GOALS) {
      if (s.goals[g.id]) continue;
      if (!GOAL_CHECKS[g.id](s, s.m)) continue;
      s.goals[g.id] = s.day;
      s.money += g.reward;
      log(s, `🏆 Goal complete: ${g.title}${g.reward ? ` (+$${g.reward.toLocaleString()})` : ''}`, 'good');
      if (g.id === 'millionaire' && !s.won) {
        s.won = true;
        s.pending.push({ kind: 'win' });
      } else {
        s.pending.push({ kind: 'goal', id: g.id });
      }
    }
  }

  function rank(s) {
    const n = Object.keys(s.goals).length;
    return DCB.RANKS[Math.min(DCB.RANKS.length - 1, Math.floor(n / 2))];
  }

  /* ---------- the hourly tick ---------- */
  function tick(s) {
    if (s.lost) return;
    const up = s.upgrades;
    s.stats.hours++;

    // 1. Power: grid, overload, outage + backup
    let plan = backupPlan(s);
    if (s.fx.outage <= 0 && plan.load > s.gridCap) {
      log(s, `⚡ Overload! Drawing ${Math.round(plan.load)} kW on a ${s.gridCap} kW feed tripped the main breaker.`, 'bad');
      s.pending.push({ kind: 'event', id: 'overload', outcome: outageOutcome(s) });
      startOutage(s, 2, 'Overload');
    }
    let powered = true;
    let onGen = false;
    if (s.fx.outage > 0) {
      const first = s.fx.outageElapsed === 0;
      let crash = false;
      if (plan.ups && plan.gen) { onGen = true; }
      else if (plan.gen) { powered = !first; onGen = !first; crash = first; }
      else if (plan.ups) {
        powered = first;
        if (s.fx.outageElapsed === 1) log(s, 'UPS batteries depleted. Servers shut down gracefully.', 'bad');
      } else { powered = false; crash = first; }
      if (crash) {
        const hit = [];
        s.tiles.forEach((t) => {
          if (t && t.status === 'ok' && (EQ[t.type].compute || EQ[t.type].storage) && rand() < 0.08) { breakTile(s, t); hit.push(t); }
        });
        log(s, `Sudden power loss! Servers crashed${hit.length ? ` and ${hit.length} piece(s) of hardware were damaged` : ''}.`, 'bad');
      }
      if (!powered) s.fx.outageDown++;
      s.fx.outageElapsed++;
      s.fx.outage--;
      if (s.fx.outage === 0) {
        if (s.fx.outageDown === 0) {
          s.flags.survived = true;
          s.stats.outagesSurvived++;
          log(s, 'Grid power restored. Zero downtime. Textbook! 👏', 'good');
        } else {
          log(s, `Grid power restored after ${s.fx.outageElapsed} hours.`, 'info');
        }
      }
    }
    s.powered = powered;
    s.onGenerator = onGen;
    const m = computeMetrics(s);

    // 2. Energy bill
    s.stats.energy += m.facility;
    if (powered) {
      if (onGen) {
        const fuel = m.facility * C.dieselPrice;
        s.money -= fuel;
        s.ledger.fuel += fuel;
        s.stats.carbon += m.facility * 0.8;
      } else {
        const cost = m.facility * m.price;
        s.money -= cost;
        s.ledger.energy += cost;
        s.stats.carbon += m.facility * (up.renewable ? C.carbonGreen : C.carbonGrid);
      }
    }

    // 3. Temperatures move toward their targets
    for (const t of s.tiles) {
      if (!t) continue;
      t.temp += (t.target - t.temp) * 0.35;
      const d = EQ[t.type];
      if (t.status === 'ok' && DCB.heatOf(d) > 0) {
        if (t.temp > C.tempThrottle && !t.warned) {
          t.warned = true;
          log(s, `🔥 A ${d.name} is at ${Math.round(t.temp)} °C and throttling! It needs more cooling nearby.`, 'warn');
        } else if (t.temp < C.tempWarn) t.warned = false;
      }
    }

    // 4. Random failures (more likely when hot)
    const failMult = up.dcim ? 0.6 : 1;
    for (const t of s.tiles) {
      if (!t || t.status !== 'ok') continue;
      let p = 0.0005 * failMult;
      if (t.temp > C.tempCritical) p += 0.05;
      else if (t.temp > C.tempThrottle) p += 0.004;
      if (rand() < p) {
        breakTile(s, t);
        log(s, `🔧 ${EQ[t.type].name} failed${t.temp > C.tempThrottle ? ' from overheating' : ''}. ${s.techs ? 'A technician is on it.' : 'You have no technicians to fix it!'}${EQ[t.type].cooling ? ' Nearby racks will heat up unless other cooling covers them (that is why N+1 matters).' : ''}`, 'bad');
      }
    }

    // 5. Repairs: each technician works on one broken item at a time
    let crew = s.techs;
    for (const t of s.tiles) {
      if (!crew) break;
      if (!t || t.status !== 'broken') continue;
      crew--;
      t.repair--;
      if (t.repair <= 0) {
        const cost = Math.round(EQ[t.type].cost * 0.08);
        t.status = 'ok';
        t.temp = Math.min(t.temp, C.roomTemp + 4);
        s.money -= cost;
        s.ledger.repairs += cost;
        log(s, `✅ ${EQ[t.type].name} repaired (parts: $${cost.toLocaleString()}).`, 'info');
      }
    }

    // 6. Service availability and revenue
    const mm = computeMetrics(s);
    const avail = mm.availability;
    s.stats.history.push(s.contracts.length ? avail : powered ? 1 : 0);
    if (s.stats.history.length > 720) s.stats.history.shift();
    for (const c of s.contracts) {
      c.hours++;
      c.down += 1 - avail;
      const pay = c.pay / 24;
      s.money += pay;
      s.ledger.revenue += pay;
      s.stats.revenue += pay;
    }
    if (s.fx.spike > 0 && avail < 0.999) s.fx.spikeShort = true;
    if (avail < 0.999 && s.contracts.length && powered && s.hour % 6 === 0) {
      log(s, `Service degraded: only ${(avail * 100).toFixed(0)}% of client demand is being served.`, 'warn');
    }

    // 7. Effects count down
    const fx = s.fx;
    if (fx.spike > 0 && --fx.spike === 0) {
      if (!fx.spikeShort && s.contracts.length) {
        const bonus = Math.round(s.contracts.reduce((a, c) => a + c.pay, 0) * 0.5);
        s.money += bonus;
        s.stats.revenue += bonus;
        s.reputation = clamp(s.reputation + 3, 0, 100);
        log(s, `🚀 You handled the traffic spike flawlessly! Bonus: $${bonus.toLocaleString()} and +3 reputation.`, 'good');
      } else log(s, 'The traffic spike is over. Not enough headroom to serve it all this time.', 'info');
    }
    for (const k of ['heatwave', 'ddos', 'fiber', 'priceSpike', 'sale', 'ransom']) if (fx[k] > 0) fx[k]--;

    // 8. Offers
    s.offers.forEach((o) => o.expires--);
    s.offers = s.offers.filter((o) => o.expires > 0);
    if (--s.timers.offer <= 0) {
      if (s.offers.length < 5) genOffer(s);
      s.timers.offer = Math.max(4, randInt(8, 18) - Math.floor(s.reputation / 12));
    }

    // 9. Events, quizzes, fun facts
    if (--s.timers.event <= 0) {
      triggerEvent(s);
      s.timers.event = randInt(36, 84);
    }
    if (--s.timers.quiz <= 0) {
      nextQuiz(s);
      s.timers.quiz = randInt(40, 70);
    }
    if (--s.timers.fact <= 0) {
      log(s, `💡 Did you know? ${pick(DCB.FACTS)}`, 'fact');
      s.timers.fact = randInt(18, 30);
    }

    // 10. Clock
    s.hour++;
    if (s.hour >= 24) endOfDay(s);

    computeMetrics(s);
    checkGoals(s);
    if (s.money < C.bankruptcy && !s.lost) {
      s.lost = true;
      s.pending.push({ kind: 'lose' });
    }
  }

  function endOfDay(s) {
    const L = s.ledger;
    L.salaries = s.techs * C.techSalary;
    L.rent = s.w * s.h * C.rentPerTile;
    s.money -= L.salaries + L.rent;

    for (const c of [...s.contracts]) {
      c.daysLeft--;
      const uptime = c.hours ? (1 - c.down / c.hours) * 100 : 100;
      if (uptime < c.sla) {
        const credit = Math.round(c.pay * 0.5);
        s.money -= credit;
        L.penalties += credit;
        c.breached = true;
        s.reputation = clamp(s.reputation - 1.5, 0, 100);
        if (uptime < c.sla - 1.5) {
          s.contracts = s.contracts.filter((x) => x !== c);
          s.reputation = clamp(s.reputation - 6, 0, 100);
          log(s, `😡 ${c.icon} ${c.name} cancelled their contract. Uptime was only ${uptime.toFixed(2)}%. (−6 reputation)`, 'bad');
          continue;
        }
        log(s, `SLA breach: ${c.icon} ${c.name} is at ${uptime.toFixed(3)}% (promised ${c.sla}%). Service credit: −$${credit.toLocaleString()}.`, 'bad');
      }
      if (c.daysLeft <= 0) {
        s.contracts = s.contracts.filter((x) => x !== c);
        s.stats.completed++;
        const gain = c.breached ? 0.5 : c.sla >= 99.99 ? 5 : 2;
        s.reputation = clamp(s.reputation + gain, 0, 100);
        if (!c.breached && c.sla >= 99.99) s.flags.fourNines = true;
        log(s, `🤝 Contract complete: ${c.icon} ${c.name} (+${gain} reputation).`, 'good');
      }
    }
    if (s.upgrades.renewable) s.reputation = clamp(s.reputation + 0.1, 0, 100);

    const costs = L.energy + L.fuel + L.salaries + L.rent + L.repairs + L.penalties;
    s.stats.opex += costs;
    s.lastLedger = { ...L, day: s.day, profit: L.revenue - costs };
    const closed = s.day;
    s.day++;
    s.hour = 0;
    log(s, `📊 Day ${closed} closed: revenue $${Math.round(L.revenue).toLocaleString()}, costs $${Math.round(costs).toLocaleString()}, profit $${Math.round(L.revenue - costs).toLocaleString()}.`, L.revenue - costs >= 0 ? 'good' : 'warn');
    s.ledger = emptyLedger();
  }

  function nines(u) {
    if (u >= 0.99999) return '5 nines';
    if (u >= 0.9999) return '4 nines';
    if (u >= 0.999) return '3 nines';
    if (u >= 0.99) return '2 nines';
    return '< 2 nines';
  }

  DCB.sim = {
    newGame, tick, computeMetrics, place, sell, buyUpgrade, upgradeGrid, expandFloor, hire, fire,
    acceptOffer, declineOffer, acceptCheck, triggerEvent, resolveChoice, answerQuiz, quizReward, nextQuiz,
    outsideTemp, priceOf, canBuild, gridUpgradeCost, floorUpgradeCost, rank, nines, timeLabel, genOffer,
    setRandom: (fn) => { rand = fn; },
    FLOOR_STEPS, AIR_LIMIT,
  };
})(typeof window !== 'undefined' ? window : globalThis);
