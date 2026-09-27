/* The Data Center Boss — rendering, input and game loop. */
(function () {
  const DCB = window.DCB;
  const sim = DCB.sim;
  const C = DCB.CONFIG;
  const EQ = DCB.EQUIPMENT;
  const SAVE_KEY = 'dcb-save-v1';
  const SPEED_MS = [Infinity, 650, 220, 60];

  let S = null;
  let speed = 1;
  let tool = null; // equipment type, 'sell', or null
  let selected = null; // tile index
  let hoverIdx = null;
  let heatmap = false;
  let tab = 'clients';
  let sound = true;
  let modalOpen = false;
  let painting = false;
  let lastSavedDay = 0;

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cache = new Map();
  function setHTML(el, html) {
    if (cache.get(el) === html) return;
    cache.set(el, html);
    el.innerHTML = html;
  }

  function money(v, compact) {
    const neg = v < 0;
    v = Math.abs(v);
    let s;
    if (compact && v >= 1e6) s = `$${(v / 1e6).toFixed(2)}M`;
    else if (compact && v >= 1e4) s = `$${(v / 1e3).toFixed(1)}k`;
    else s = `$${Math.round(v).toLocaleString()}`;
    return neg ? `−${s}` : s;
  }
  const kw = (v) => `${v < 10 ? v.toFixed(1) : Math.round(v)} kW`;
  function slaDowntime(sla) {
    const min = (1 - sla / 100) * 30 * 24 * 60;
    return min >= 120 ? `${(min / 60).toFixed(1)} h/month` : `${Math.round(min)} min/month`;
  }

  /* ---------- sound ---------- */
  let actx = null;
  function beep(notes, type) {
    if (!sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      let t = actx.currentTime;
      for (const [f, d] of notes) {
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.type = type || 'square';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(actx.destination);
        o.start(t);
        o.stop(t + d);
        t += d * 0.8;
      }
    } catch (e) { /* audio unavailable */ }
  }
  const sfx = {
    build: () => beep([[660, 0.06], [880, 0.08]]),
    sell: () => beep([[440, 0.06], [330, 0.08]]),
    error: () => beep([[160, 0.15]], 'sawtooth'),
    alarm: () => beep([[880, 0.12], [660, 0.12], [880, 0.12]], 'sawtooth'),
    good: () => beep([[523, 0.08], [659, 0.08], [784, 0.14]], 'triangle'),
    cash: () => beep([[988, 0.05], [1319, 0.1]], 'triangle'),
  };

  /* ---------- save / load ---------- */
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...S, m: undefined })); } catch (e) { /* storage unavailable */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || s.version !== 1) return null;
      sim.computeMetrics(s);
      return s;
    } catch (e) { return null; }
  }

  /* ---------- top bar ---------- */
  function bar(used, cap, invert) {
    const p = cap > 0 ? Math.min(1, used / cap) : used > 0 ? 1 : 0;
    const lvl = invert ? (p > 0.95 ? 'bad' : p > 0.8 ? 'warn' : 'ok') : 'ok';
    return `<span class="bar ${lvl}"><span style="width:${(p * 100).toFixed(0)}%"></span></span>`;
  }

  function renderStats() {
    const m = S.m;
    const upt = m.uptime * 100;
    const pueCls = m.it === 0 ? '' : m.pue < 1.3 ? 'good' : m.pue < 1.6 ? 'ok' : 'bad';
    const stat = (icon, label, val, tip, extra, cls) =>
      `<div class="stat ${cls || ''}" data-tip="${esc(tip)}"><span class="si">${icon}</span><div><div class="sl">${label}</div><div class="sv">${val}</div>${extra || ''}</div></div>`;
    const html = [
      stat('💰', 'Cash', money(S.money, true), `Your bank balance. Income today so far: ${money(S.ledger.revenue)}. Contracts pay ${money(m.dailyRevenue)}/day in total. Go below ${money(C.bankruptcy)} and you are bankrupt!`, '', S.money < 0 ? 'bad' : ''),
      stat('📅', sim.timeLabel(S).replace(' ', ' · ').replace('Day · ', 'Day '), `${Math.round(m.outside)}°C outside`, 'In-game clock. One tick is one hour. A year lasts 120 days, so the seasons change as you play: winters are great for free-air cooling!'),
      stat('⭐', 'Reputation', `${Math.round(S.reputation)}/100`, 'Better reputation attracts bigger clients who pay more. Raise it by keeping SLAs, finishing contracts and acing the board quizzes.'),
      stat('✅', 'Uptime (30d)', `${upt >= 99.995 ? upt.toFixed(3) : upt.toFixed(2)}%`, `Share of client demand you served over the last 30 days: ${sim.nines(m.uptime)}. 99.9% ("three nines") still allows 43 minutes of downtime a month.`, `<div class="sub">${sim.nines(m.uptime)}</div>`, upt < 99 ? 'bad' : upt < 99.9 ? 'warn' : ''),
      stat('♻️', 'PUE', m.it ? m.pue.toFixed(2) : '—', `Power Usage Effectiveness = total power ÷ IT power = ${kw(m.facility)} ÷ ${kw(m.it)}. 1.0 is perfect; the average data center is ~1.5. Cooling is the biggest overhead.`, '', pueCls),
      stat('⚡', 'Power', `${Math.round(m.facility)}/${S.gridCap} kW`, `Total facility draw vs. your utility feed. IT ${kw(m.it)} + cooling ${kw(m.cooling)} + other ${kw(m.aux + m.lights)}. Go over the feed and the main breaker trips! Price: $${m.price.toFixed(2)}/kWh.`, bar(m.facility, S.gridCap, true)),
      stat('🧮', 'Compute', `${Math.round(m.demandCompute)}/${Math.round(m.computeCap)}`, 'Client demand vs. working compute capacity. Hot (throttled) or broken racks deliver less.', bar(m.demandCompute, m.computeCap, true)),
      stat('💾', 'Storage', `${Math.round(m.demandStorage)}/${Math.round(m.storageCap)} TB`, 'Client storage demand vs. working storage (TB).', bar(m.demandStorage, m.storageCap, true)),
      stat('🌐', 'Network', `${Math.round(m.demandBw)}/${Math.round(m.bwCap)} Gbps`, 'Bandwidth demand vs. capacity. DDoS attacks and fiber cuts hit here.', bar(m.demandBw, m.bwCap, true)),
      stat('🌱', 'CO₂', `${(S.stats.carbon / 1000).toFixed(1)} t`, 'Total carbon emitted by your electricity. A lower PUE and renewable energy both reduce it.'),
    ].join('');
    setHTML($('#stats'), html);
    $('#rank').textContent = sim.rank(S);
    document.querySelectorAll('.speed button').forEach((b) => b.classList.toggle('active', +b.dataset.speed === speed));
    $('#btn-sound').textContent = sound ? '🔊' : '🔇';
  }

  function renderAlerts() {
    const m = S.m;
    const fx = S.fx;
    const a = [];
    if (fx.outage > 0) a.push(['bad', `⚡ Grid outage (${fx.outage}h left) · ${S.powered ? (S.onGenerator ? 'running on generators' : 'running on UPS batteries') : 'DARK'}`]);
    if (!S.powered && fx.outage <= 0) a.push(['bad', '⚡ No power']);
    if (fx.heatwave > 0) a.push(['warn', `🌡️ Heat wave (${fx.heatwave}h)`]);
    if (fx.ddos > 0) a.push(['warn', `🌊 DDoS attack (${fx.ddos}h)`]);
    if (fx.fiber > 0 && !S.upgrades.dualfiber) a.push(['bad', `🚜 Fiber cut: offline (${fx.fiber}h)`]);
    if (fx.ransom > 0) a.push(['bad', `🦠 Restoring from ransomware (${fx.ransom}h)`]);
    if (fx.spike > 0) a.push(['info', `🚀 Traffic spike (${fx.spike}h)${fx.spikeShort ? ': missed' : ''}`]);
    if (fx.priceSpike > 0) a.push(['warn', `💸 Power price ×3 (${fx.priceSpike}h)`]);
    if (fx.sale > 0) a.push(['good', `🏷️ 25% off equipment (${fx.sale}h)`]);
    if (m.facility > S.gridCap * 0.9 && S.powered) a.push(['bad', `🔌 Power at ${Math.round((m.facility / S.gridCap) * 100)}% of your feed! Upgrade the grid connection.`]);
    if (m.hot) a.push(['warn', `🔥 ${m.hot} overheating ${m.hot > 1 ? 'units are' : 'unit is'} throttling`]);
    if (m.broken) a.push([S.techs ? 'warn' : 'bad', `🔧 ${m.broken} broken ${S.techs ? '' : '· hire a technician!'}`]);
    if (S.powered && m.availability < 0.999 && S.contracts.length) a.push(['bad', `📉 Serving ${(m.availability * 100).toFixed(0)}% of demand`]);
    setHTML($('#alerts'), a.map(([c, t]) => `<span class="chip ${c}">${esc(t)}</span>`).join(''));
  }

  /* ---------- floor ---------- */
  function leds(n, cls) {
    let h = '';
    for (let i = 0; i < n; i++) h += `<i class="u ${cls || ''}"><b></b><b></b><b></b></i>`;
    return h;
  }
  const ART = {
    rack: () => `<div class="art rack">${leds(5)}</div>`,
    dense: () => `<div class="art rack dense">${leds(7, 'thin')}</div>`,
    gpu: () => `<div class="art rack gpu">${leds(4, 'gpu')}<span class="lbl">GPU</span></div>`,
    storage: () => `<div class="art storage">${'<i class="disk"></i>'.repeat(6)}</div>`,
    crac: () => `<div class="art crac"><div class="fan"><i></i><i></i><i></i></div><span class="lbl">CRAC</span></div>`,
    inrow: () => `<div class="art inrow"><div class="vents"></div><div class="fan small"><i></i><i></i><i></i></div></div>`,
    cdu: () => `<div class="art cdu"><div class="pipe a"></div><div class="pipe b"></div><span class="lbl">CDU</span></div>`,
    switch: () => `<div class="art switch"><div class="ports">${'<i></i>'.repeat(8)}</div><div class="ports">${'<i></i>'.repeat(8)}</div></div>`,
    firewall: () => `<div class="art firewall"><span>🛡️</span></div>`,
    ups: () => `<div class="art ups"><div class="batt"><i></i></div><span class="lbl">UPS</span></div>`,
    generator: () => `<div class="art gen"><div class="exhaust"></div><span>⛽</span><span class="lbl">GEN</span></div>`,
  };

  function heatColor(temp) {
    const p = Math.max(0, Math.min(1, (temp - 19) / 20));
    const hue = 210 - p * 210;
    return `hsla(${hue}, 85%, 50%, ${0.2 + p * 0.5})`;
  }

  function tileTemp(i) {
    const t = S.tiles[i];
    if (t) return t.temp;
    const x = i % C.maxW;
    const y = Math.floor(i / C.maxW);
    let sum = 0;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= C.maxW || ny >= C.maxH) continue;
        const nt = S.tiles[ny * C.maxW + nx];
        if (nt && nt.temp > C.roomTemp + 1) { sum += nt.temp; n++; }
      }
    }
    return n ? C.roomTemp + (sum / n - C.roomTemp) * 0.5 : C.roomTemp;
  }

  function rangeOf() {
    // Which cooling range to highlight: the tool being placed, or the hovered/selected cooler
    let type = null;
    let center = null;
    if (tool && EQ[tool] && EQ[tool].cooling && hoverIdx !== null) { type = tool; center = hoverIdx; }
    else {
      const i = hoverIdx !== null && S.tiles[hoverIdx] && EQ[S.tiles[hoverIdx].type].cooling ? hoverIdx : selected;
      if (i !== null && S.tiles[i] && EQ[S.tiles[i].type].cooling) { type = S.tiles[i].type; center = i; }
    }
    if (!type) return null;
    return { cx: center % C.maxW, cy: Math.floor(center / C.maxW), r: EQ[type].radius };
  }

  // Show the built floor plus one strip of not-yet-built space.
  const visW = () => Math.min(C.maxW, S.w + 1);
  const visH = () => Math.min(C.maxH, S.h + 1);

  function renderFloor() {
    const range = rangeOf();
    let html = '';
    for (let y = 0; y < visH(); y++) {
      for (let x = 0; x < visW(); x++) {
        const i = y * C.maxW + x;
        const locked = x >= S.w || y >= S.h;
        const t = S.tiles[i];
        const cls = ['tile'];
        let inner = '';
        let style = '';
        if (locked) cls.push('locked');
        if (range && !locked && Math.max(Math.abs(x - range.cx), Math.abs(y - range.cy)) <= range.r) cls.push('in-range');
        if (i === selected) cls.push('selected');
        if (!S.powered) cls.push('dark');
        if (heatmap && !locked) style = `--heat:${heatColor(tileTemp(i))}`;
        if (t) {
          const d = EQ[t.type];
          cls.push(`t-${t.type}`, `s-${t.status}`);
          inner = ART[t.type]();
          if (t.status === 'broken') {
            inner += `<span class="badge fix">🔧</span><span class="repair"><span style="width:${((C.repairHours - t.repair) / C.repairHours) * 100}%"></span></span>`;
          } else if (DCB.heatOf(d) > 0 && t.temp > C.tempThrottle) {
            inner += '<span class="badge hot">🔥</span>';
            cls.push('overheat');
          } else if (DCB.heatOf(d) >= 2 && t.cool < 0.95) {
            inner += '<span class="badge warm">🌡️</span>';
          }
          if (DCB.heatOf(d) > 0 && (heatmap || t.temp > C.tempWarn)) {
            inner += `<span class="temp">${Math.round(t.temp)}°</span>`;
          }
        } else if (!locked && tool && tool !== 'sell' && i === hoverIdx) {
          cls.push('ghost', `t-${tool}`);
          inner = ART[tool]();
        } else if (locked && x === S.w && y === 0) {
          inner = '<span class="lock">🔒</span>';
        }
        html += `<div class="${cls.join(' ')}" data-i="${i}" style="${style}">${inner}</div>`;
      }
    }
    $('#floor').style.gridTemplateColumns = `repeat(${visW()}, var(--tile))`;
    setHTML($('#floor'), html);
    $('#floor').classList.toggle('heat', heatmap);
    $('#floor').classList.toggle('tool-sell', tool === 'sell');
  }

  function renderHint() {
    let h = '';
    if (tool === 'sell') h = 'Click equipment to sell it for 50% of its price (25% if broken). <kbd>Esc</kbd> to cancel.';
    else if (tool) {
      const d = EQ[tool];
      h = `Placing <b>${d.name}</b> (${money(sim.priceOf(S, tool))}). Click or drag on empty floor tiles. ${d.cooling ? `The highlighted square shows its cooling range (${d.radius} tile${d.radius > 1 ? 's' : ''}).` : ''} <kbd>Esc</kbd> to cancel.`;
    } else if (!Object.keys(S.goals).length) h = '👉 Pick <b>Server Rack</b> from the Build menu, then click a floor tile to place it.';
    else h = 'Click equipment to inspect it. Hover a cooling unit to see its range.';
    setHTML($('#hint'), h);
  }

  function renderTileInfo() {
    const el = $('#tile-info');
    const t = selected !== null ? S.tiles[selected] : null;
    if (!t) { setHTML(el, ''); el.hidden = true; return; }
    el.hidden = false;
    const d = EQ[t.type];
    const rows = [];
    rows.push(['Status', t.status === 'ok' ? (S.powered ? '🟢 Running' : '⚫ No power') : `🔴 Broken · ${S.techs ? `repair in ~${Math.max(1, Math.ceil(t.repair))}h` : 'no technicians!'}`]);
    if (d.power) rows.push(['Power draw', kw(d.power)]);
    if (d.compute) rows.push(['Compute', `+${d.compute}${S.upgrades.virtualization ? ' ×1.3 (virtualized)' : ''}`]);
    if (d.storage) rows.push(['Storage', `+${d.storage} TB`]);
    if (d.bw) rows.push(['Bandwidth', `+${d.bw} Gbps`]);
    if (d.cooling) rows.push(['Cooling', `${d.cooling} kW within ${d.radius} tile(s), COP ${d.cop}`]);
    if (d.ups) rows.push(['Backup', `${d.ups} kW battery bridge`]);
    if (d.gen) rows.push(['Backup', `${d.gen} kW generator`]);
    const heat = DCB.heatOf(d);
    if (heat > 0 && t.status === 'ok') {
      rows.push(['Temperature', `${t.temp.toFixed(1)} °C ${t.temp > C.tempThrottle ? '🔥 throttling!' : t.temp > C.tempWarn ? '⚠️ above ASHRAE range' : '✅ in ASHRAE range'}`]);
      rows.push(['Heat removed', `${Math.round(t.cool * 100)}% of ${kw(heat)}`]);
    }
    let advice = '';
    if (heat > 0 && t.status === 'ok' && t.cool < 0.95) {
      advice = heat > sim.AIR_LIMIT
        ? `<p class="advice">⚠️ Air cooling can only pull about ${sim.AIR_LIMIT} kW from a single rack. This one makes ${heat} kW, so it needs a <b>Liquid Cooling CDU</b> next to it.</p>`
        : '<p class="advice">⚠️ Not all of this heat is being removed. Put a cooling unit within range, or add more cooling capacity nearby.</p>';
    }
    setHTML(el, `
      <div class="ti-head"><b>${d.name}</b><button class="x" data-action="deselect" aria-label="Close">✕</button></div>
      <table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
      ${advice}
      <p class="lesson">📘 ${esc(d.lesson)}</p>
      <button class="btn danger" data-action="sell-selected">Sell for ${money(d.cost * (t.status === 'ok' ? 0.5 : 0.25))}</button>`);
  }

  /* ---------- build palette ---------- */
  function renderPalette() {
    const el = $('#palette');
    if (el.matches(':hover') && cache.has(el) && !paletteDirty) return;
    paletteDirty = false;
    let html = '';
    for (const cat of DCB.CATEGORIES) {
      html += `<h3>${cat.name}</h3><div class="items">`;
      for (const [id, d] of Object.entries(EQ)) {
        if (d.cat !== cat.id) continue;
        const locked = d.requires && !S.upgrades[d.requires];
        const price = sim.priceOf(S, id);
        const poor = S.money < price;
        const specs = [];
        if (d.compute) specs.push(`🧮${d.compute}`);
        if (d.storage) specs.push(`💾${d.storage}TB`);
        if (d.bw) specs.push(`🌐${d.bw}G`);
        if (d.cooling) specs.push(`❄️${d.cooling}kW r${d.radius}`);
        if (d.ups) specs.push(`🔋${d.ups}kW`);
        if (d.gen) specs.push(`⛽${d.gen}kW`);
        if (d.security) specs.push('🛡️');
        if (d.power) specs.push(`⚡${d.power}`);
        const tip = `${d.desc}${locked ? `\n🔒 Unlock with the "${DCB.UPGRADES[d.requires].name}" upgrade.` : ''}\n\n📘 ${d.lesson}`;
        html += `<button class="item ${tool === id ? 'active' : ''} ${locked ? 'locked' : ''} ${poor ? 'poor' : ''}" data-build="${id}" data-tip="${esc(tip)}">
          <span class="mini t-${id}">${ART[id]()}</span>
          <span class="meta"><span class="nm">${locked ? '🔒 ' : ''}${d.name}</span><span class="pr">${money(price)}${S.fx.sale > 0 ? ' 🏷️' : ''}</span><span class="sp">${specs.join(' ')}</span></span>
        </button>`;
      }
      html += '</div>';
    }
    setHTML(el, html);
    $('#tool-sell').classList.toggle('active', tool === 'sell');
  }
  let paletteDirty = true;

  function renderFacility() {
    const el = $('#facility');
    if (el.matches(':hover') && cache.has(el)) return;
    const gc = sim.gridUpgradeCost(S);
    const fc = sim.floorUpgradeCost(S);
    const next = sim.FLOOR_STEPS[S.floorStep + 1];
    setHTML(el, `<h3>Facility</h3>
      <button class="btn wide" data-action="grid" data-tip="Ask the utility for a bigger connection: +150 kW. Your feed limits total facility power: IT + cooling + everything else.">🔌 Grid feed +150 kW<br><small>${S.gridCap} kW → ${S.gridCap + 150} kW · ${money(gc)}</small></button>
      ${fc !== null ? `<button class="btn wide" data-action="expand" data-tip="Build out more of the building for more racks. Rent is $${C.rentPerTile}/tile/day.">🏗️ Expand floor<br><small>${S.w}×${S.h} → ${next[0]}×${next[1]} · ${money(fc)}</small></button>` : '<p class="muted">Building at maximum size.</p>'}`);
  }

  /* ---------- side tabs ---------- */
  function renderTab() {
    const el = $('#tab-body');
    if (el.matches(':hover') && cache.has(el) && !tabDirty) return;
    tabDirty = false;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const fn = { clients: tabClients, upgrades: tabUpgrades, team: tabTeam, goals: tabGoals, handbook: tabHandbook }[tab];
    setHTML(el, fn());
  }
  let tabDirty = true;

  function tabClients() {
    const m = S.m;
    let h = `<div class="cap-summary">Free capacity: 🧮 ${Math.floor(m.computeInst - m.committedCompute)} · 💾 ${Math.floor(m.storageInst - m.committedStorage)} TB · 🌐 ${Math.floor(m.bwInst - m.committedBw)} Gbps</div>`;
    h += `<h3>Offers <span class="muted">(${S.offers.length})</span></h3>`;
    if (!S.offers.length) h += '<p class="muted">No offers right now. New clients call in every few hours, and more often with a higher reputation.</p>';
    for (const o of S.offers) {
      const err = sim.acceptCheck(S, o);
      h += `<div class="card offer">
        <div class="c-head"><span class="c-icon">${o.icon}</span><div><b>${esc(o.name)}</b><div class="muted">${o.days} days · expires in ${o.expires}h</div></div><div class="pay">${money(o.pay)}<small>/day</small></div></div>
        <div class="reqs"><span>🧮 ${o.compute}</span><span>💾 ${o.storage} TB</span><span>🌐 ${o.bw} Gbps</span><span class="sla" data-tip="Service Level Agreement: you promise ${o.sla}% uptime, which allows about ${slaDowntime(o.sla)} of downtime. Drop below it and you pay service credits.">SLA ${o.sla}%</span>${o.needs ? '<span>🛡️ Firewall</span>' : ''}</div>
        ${err ? `<div class="err">${esc(err)}</div>` : ''}
        <div class="actions"><button class="btn primary" data-action="accept" data-id="${o.id}" ${err ? 'disabled' : ''}>Sign contract</button><button class="btn ghost" data-action="decline" data-id="${o.id}">Decline</button></div>
      </div>`;
    }
    h += `<h3>Active contracts <span class="muted">(${S.contracts.length})</span></h3>`;
    if (!S.contracts.length) h += '<p class="muted">No clients yet. Build capacity, then sign an offer above.</p>';
    for (const c of S.contracts) {
      const up = c.hours ? (1 - c.down / c.hours) * 100 : 100;
      const ok = up >= c.sla;
      h += `<div class="card contract ${ok ? '' : 'breach'}">
        <div class="c-head"><span class="c-icon">${c.icon}</span><div><b>${esc(c.name)}</b><div class="muted">${c.daysLeft} days left · ${money(c.pay)}/day</div></div></div>
        <div class="uptime"><span>Uptime <b>${up >= 99.995 ? up.toFixed(3) : up.toFixed(2)}%</b></span><span>SLA ${c.sla}% ${ok ? '✅' : '❌'}</span></div>
        <div class="reqs"><span>🧮 ${c.compute}</span><span>💾 ${c.storage} TB</span><span>🌐 ${c.bw} Gbps</span></div>
      </div>`;
    }
    return h;
  }

  function tabUpgrades() {
    let h = '<p class="muted">Permanent improvements to your facility. Each one teaches a real data center technique.</p>';
    for (const [id, u] of Object.entries(DCB.UPGRADES)) {
      const own = S.upgrades[id];
      h += `<div class="card upg ${own ? 'owned' : ''}">
        <div class="c-head"><span class="c-icon">${u.icon}</span><div><b>${u.name}</b><div class="muted">${esc(u.desc)}</div></div></div>
        <p class="lesson">📘 ${esc(u.lesson)}</p>
        ${own ? '<div class="owned-tag">✔ Installed</div>' : `<button class="btn primary" data-action="upgrade" data-id="${id}" ${S.money < u.cost ? 'disabled' : ''}>Buy · ${money(u.cost)}</button>`}
      </div>`;
    }
    return h;
  }

  function tabTeam() {
    const L = S.lastLedger;
    const st = S.stats;
    let h = `<h3>Technicians</h3>
      <div class="card"><div class="team">${'👷'.repeat(S.techs) || '<span class="muted">Nobody!</span>'}</div>
      <p>${S.techs} technician${S.techs === 1 ? '' : 's'} · ${money(C.techSalary)}/day each. Each technician repairs one broken unit at a time (${C.repairHours}h per repair).</p>
      <div class="actions"><button class="btn primary" data-action="hire">Hire ($2,000 fee)</button><button class="btn ghost" data-action="fire" ${S.techs ? '' : 'disabled'}>Let one go</button></div></div>`;
    h += '<h3>Yesterday’s books</h3>';
    if (L) {
      const row = (k, v, cls) => `<tr class="${cls || ''}"><td>${k}</td><td>${money(v)}</td></tr>`;
      h += `<table class="ledger">
        ${row('Client revenue', L.revenue, 'pos')}
        ${row('Electricity', -L.energy)}
        ${L.fuel ? row('Diesel fuel', -L.fuel) : ''}
        ${row('Salaries', -L.salaries)}
        ${row('Rent', -L.rent)}
        ${L.repairs ? row('Repairs', -L.repairs) : ''}
        ${L.penalties ? row('SLA credits & penalties', -L.penalties) : ''}
        ${row('Profit', L.profit, L.profit >= 0 ? 'total pos' : 'total neg')}
      </table>`;
    } else h += '<p class="muted">Your first daily report arrives at midnight.</p>';
    const m = S.m;
    h += `<h3>Power breakdown (now)</h3>
      <div class="pbar">${pbar(m)}</div>
      <p class="muted">PUE ${m.it ? m.pue.toFixed(2) : '—'}: for every 1 kW your servers use, the building uses ${m.it ? m.pue.toFixed(2) : '—'} kW in total.</p>
      <h3>Lifetime</h3>
      <table class="ledger">
        <tr><td>Revenue</td><td>${money(st.revenue)}</td></tr>
        <tr><td>Equipment & upgrades</td><td>${money(st.capex)}</td></tr>
        <tr><td>Operating costs</td><td>${money(st.opex)}</td></tr>
        <tr><td>Energy used</td><td>${(st.energy / 1000).toFixed(1)} MWh</td></tr>
        <tr><td>Contracts completed</td><td>${st.completed}</td></tr>
        <tr><td>Board quiz score</td><td>${st.quizRight}/${st.quizTotal}</td></tr>
      </table>`;
    return h;
  }

  function pbar(m) {
    const total = m.facility || 1;
    const seg = (v, cls, label) => (v > 0 ? `<span class="${cls}" style="flex:${v}" data-tip="${label}: ${kw(v)}"></span>` : '');
    return seg(m.it, 'p-it', 'IT equipment') + seg(m.cooling, 'p-cool', 'Cooling') + seg(m.aux + m.lights, 'p-other', 'UPS, generator, fans & lights') +
      `</div><div class="legend"><span class="p-it"></span>IT ${Math.round((m.it / total) * 100)}% <span class="p-cool"></span>Cooling ${Math.round((m.cooling / total) * 100)}% <span class="p-other"></span>Other ${Math.round(((m.aux + m.lights) / total) * 100)}%`;
  }

  function tabGoals() {
    const done = Object.keys(S.goals).length;
    let h = `<div class="rankbox"><div class="muted">Rank</div><div class="rk">${sim.rank(S)}</div><div class="bar ok big"><span style="width:${(done / DCB.GOALS.length) * 100}%"></span></div><div class="muted">${done}/${DCB.GOALS.length} goals</div></div><ol class="goals">`;
    let nextShown = false;
    for (const g of DCB.GOALS) {
      const d = S.goals[g.id];
      const isNext = !d && !nextShown;
      if (isNext) nextShown = true;
      h += `<li class="${d ? 'done' : isNext ? 'next' : ''}"><span class="gi">${d ? '🏆' : isNext ? '🎯' : '⬜'}</span><div><b>${g.title}</b><div class="muted">${g.desc}${g.reward ? ` · reward ${money(g.reward)}` : ''}${d ? ` · done day ${d}` : ''}</div></div></li>`;
    }
    return h + '</ol>';
  }

  function tabHandbook() {
    let h = `<div class="card"><b>🧠 The golden rules</b><ol class="rules">
      <li><b>Every watt becomes heat.</b> Each rack needs cooling in range, or it throttles and breaks.</li>
      <li><b>Power chain:</b> UPS (instant) + Generator (long outages). You need both, and big enough for your load.</li>
      <li><b>Watch your feed.</b> Total power, including cooling, must stay under your grid connection.</li>
      <li><b>Keep headroom.</b> Spare compute and bandwidth absorb traffic spikes and DDoS attacks.</li>
      <li><b>Efficiency pays.</b> A lower PUE means lower bills and less CO₂.</li>
    </ol></div>
    <div class="card"><b>♻️ PUE, visualized</b><p>PUE = Total facility power ÷ IT power.</p>
      <div class="pue-demo"><div><span class="p-it" style="flex:1"></span><span class="p-cool" style="flex:0.1"></span></div><small>1.1: hyperscale champion</small></div>
      <div class="pue-demo"><div><span class="p-it" style="flex:1"></span><span class="p-cool" style="flex:0.5"></span></div><small>1.5: industry average</small></div>
      <div class="pue-demo"><div><span class="p-it" style="flex:1"></span><span class="p-cool" style="flex:1"></span></div><small>2.0: old server closet</small></div>
    </div>
    <h3>Glossary</h3><dl class="glossary">`;
    for (const [term, def] of DCB.GLOSSARY) h += `<dt>${term}</dt><dd>${esc(def)}</dd>`;
    return h + '</dl>';
  }

  /* ---------- log ---------- */
  function renderLog() {
    setHTML($('#log'), S.log.slice(0, 30).map((l) => `<li class="${l.kind}"><span class="lt">${l.t}</span> ${esc(l.msg)}</li>`).join(''));
  }

  function render() {
    renderStats();
    renderAlerts();
    renderFloor();
    renderHint();
    renderTileInfo();
    renderPalette();
    renderFacility();
    renderTab();
    renderLog();
  }

  /* ---------- modal ---------- */
  function openModal(html, cls) {
    const m = $('#modal');
    m.className = cls || '';
    m.innerHTML = html;
    $('#modal-bg').hidden = false;
    modalOpen = true;
    const b = m.querySelector('button');
    if (b) b.focus();
  }
  function closeModal() {
    $('#modal-bg').hidden = true;
    modalOpen = false;
    render();
    showPending();
  }

  function showPending() {
    if (modalOpen || !S.pending.length) return;
    const p = S.pending.shift();
    if (p.kind === 'event') {
      if (p.id === 'overload') {
        sfx.alarm();
        openModal(`<div class="m-icon">🔌</div><h2>Main Breaker Tripped!</h2>
          <p>Your facility tried to draw more power than your utility connection can deliver, so the protective breaker opened.</p>
          <p class="outcome">${esc(p.outcome)}</p>
          <div class="lesson-box">📘 Every building has a maximum power capacity. Remember: cooling draws power too! Upgrade your grid feed (Facility section) or improve efficiency before adding more racks.</div>
          <button class="btn primary" data-action="close">Got it</button>`, 'bad');
        return;
      }
      const e = DCB.EVENTS[p.id];
      const bad = ['outage', 'squirrel', 'ransomware', 'fiber', 'ddos', 'disk'].includes(p.id);
      (bad ? sfx.alarm : sfx.good)();
      openModal(`<div class="m-icon">${e.icon}</div><h2>${e.title}</h2><p>${esc(e.text)}</p>
        ${p.outcome ? `<p class="outcome">${esc(p.outcome)}</p>` : ''}
        <div class="lesson-box">📘 ${esc(e.lesson)}</div>
        ${p.choices ? `<div class="actions">${p.choices.map((c, i) => `<button class="btn ${i ? 'ghost' : 'primary'}" data-action="choice" data-ev="${p.id}" data-choice="${i}">${esc(c)}</button>`).join('')}</div>` : '<button class="btn primary" data-action="close">Continue</button>'}`, bad ? 'bad' : '');
    } else if (p.kind === 'quiz') {
      const Q = DCB.QUIZ[p.q];
      sfx.cash();
      openModal(`<div class="m-icon">🎓</div><h2>Board Meeting Pop Quiz</h2><p class="muted">The investors want to know that their boss knows the business. Answer correctly for ${money(sim.quizReward(S))} and +2 reputation.</p>
        <p class="q">${esc(Q.q)}</p>
        <div class="answers">${Q.a.map((a, i) => [Math.random(), i]).sort((x, y) => x[0] - y[0]).map(([, i]) => `<button class="btn answer" data-action="answer" data-q="${p.q}" data-choice="${i}">${esc(Q.a[i])}</button>`).join('')}</div>`);
    } else if (p.kind === 'goal') {
      const g = DCB.GOALS.find((x) => x.id === p.id);
      sfx.good();
      openModal(`<div class="m-icon trophy">🏆</div><h2>Goal complete!</h2><h3>${g.title}</h3><p>${g.desc}</p>
        ${g.reward ? `<p class="reward">+${money(g.reward)}</p>` : ''}<p class="muted">Rank: <b>${sim.rank(S)}</b></p>
        ${nextGoalHtml()}
        <button class="btn primary" data-action="close">Onward!</button>`, 'good');
    } else if (p.kind === 'win') {
      sfx.good();
      openModal(`<div class="m-icon trophy">🌐</div><h2>You are a Hyperscaler!</h2>
        <p>$1,000,000 in the bank on day ${S.day}. From an empty room to a humming data center: you are officially <b>The Data Center Boss</b>.</p>
        <p class="muted">Uptime ${(S.m.uptime * 100).toFixed(3)}% · PUE ${S.m.pue.toFixed(2)} · ${S.stats.completed} contracts completed · quiz ${S.stats.quizRight}/${S.stats.quizTotal}</p>
        <div class="actions"><button class="btn primary" data-action="close">Keep playing</button><button class="btn ghost" data-action="new">New game</button></div>`, 'good');
    } else if (p.kind === 'lose') {
      sfx.alarm();
      speed = 0;
      openModal(`<div class="m-icon">📉</div><h2>Bankrupt!</h2>
        <p>The bank has pulled the plug on day ${S.day}. Running a data center is a balance of capital spending, operating costs and reliable revenue.</p>
        <div class="lesson-box">📘 Tips: sign clients before over-building, keep PUE low to shrink the power bill, and protect your SLAs. Service credits add up fast!</div>
        <button class="btn primary" data-action="new">Try again</button>`, 'bad');
    }
  }

  function nextGoalHtml() {
    const g = DCB.GOALS.find((x) => !S.goals[x.id]);
    return g ? `<p class="next-goal">🎯 Next: <b>${g.title}</b>: ${g.desc}</p>` : '';
  }

  function showHelp(first) {
    openModal(`<div class="m-icon">🖥️</div><h2>${first ? 'Welcome, Boss!' : 'How to play'}</h2>
      <p>You have just taken over an empty server hall. Turn it into a profitable, reliable, efficient data center, and learn how the internet is kept running along the way.</p>
      <ol class="howto">
        <li><b>Build</b> racks for compute, storage arrays for data, and switches for bandwidth.</li>
        <li><b>Cool</b> them. Every watt a server uses becomes heat. Put CRAC units within range of racks and keep them under 27 °C.</li>
        <li><b>Sign clients</b> in the Clients tab. They pay daily but expect their SLA uptime.</li>
        <li><b>Protect</b> against outages with a UPS <i>and</i> a generator, and hire technicians to fix broken gear.</li>
        <li><b>Optimize</b>: upgrades lower your PUE and unlock liquid cooling for AI racks.</li>
      </ol>
      <p class="muted">Goal: reach <b>$1,000,000</b>. Watch for events and board quizzes, since they teach real data center lessons. Hover anything for details.</p>
      <p class="muted keys">Keys: <kbd>Space</kbd> pause · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> speed · <kbd>H</kbd> heat map · <kbd>Esc</kbd> cancel</p>
      <button class="btn primary" data-action="close">${first ? 'Let’s build!' : 'Back to work'}</button>`);
  }

  /* ---------- actions ---------- */
  function flash(msg) {
    sfx.error();
    const h = $('#hint');
    cache.delete(h);
    h.innerHTML = `<span class="err">${esc(msg)}</span>`;
    h.dataset.flash = Date.now();
  }

  function act(res, okSfx) {
    if (res && res.ok === false) { flash(res.msg); return false; }
    if (okSfx) okSfx();
    tabDirty = true;
    paletteDirty = true;
    cache.clear();
    render();
    showPending();
    return true;
  }

  function onTile(i, fromDrag) {
    const x = i % C.maxW;
    const y = Math.floor(i / C.maxW);
    const t = S.tiles[i];
    if (tool === 'sell') {
      if (t) { act(sim.sell(S, x, y), sfx.sell); if (selected === i) selected = null; }
      return;
    }
    if (tool && !t) {
      if (x >= S.w || y >= S.h) { if (!fromDrag) flash('That part of the building is not built out yet. Use "Expand floor".'); return; }
      const r = sim.place(S, x, y, tool);
      if (!r.ok && fromDrag) return;
      act(r, sfx.build);
      return;
    }
    if (fromDrag) return;
    selected = t ? (selected === i ? null : i) : null;
    render();
  }

  function newGame() {
    S = sim.newGame();
    tool = null;
    selected = null;
    speed = 1;
    lastSavedDay = 0;
    cache.clear();
    tabDirty = paletteDirty = true;
    save();
    resize();
    render();
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action],[data-build],[data-tab],[data-speed]');
    if (!b || b.disabled) return;
    if (b.dataset.build) {
      const id = b.dataset.build;
      const d = EQ[id];
      if (d.requires && !S.upgrades[d.requires]) { flash(`🔒 ${d.name} requires the "${DCB.UPGRADES[d.requires].name}" upgrade (Upgrades tab).`); return; }
      tool = tool === id ? null : id;
      selected = null;
      paletteDirty = true;
      render();
      return;
    }
    if (b.dataset.tab) { tab = b.dataset.tab; tabDirty = true; renderTab(); return; }
    if (b.dataset.speed) { speed = +b.dataset.speed; renderStats(); return; }
    const id = b.dataset.id;
    switch (b.dataset.action) {
      case 'close': closeModal(); break;
      case 'new':
        $('#modal-bg').hidden = true;
        modalOpen = false;
        newGame();
        showHelp(true);
        break;
      case 'accept': act(sim.acceptOffer(S, +id), sfx.cash); break;
      case 'decline': sim.declineOffer(S, +id); act(null); break;
      case 'upgrade': act(sim.buyUpgrade(S, id), sfx.good); break;
      case 'grid': act(sim.upgradeGrid(S), sfx.good); break;
      case 'expand': act(sim.expandFloor(S), sfx.good); resize(); break;
      case 'hire': act(sim.hire(S), sfx.build); break;
      case 'fire': act(sim.fire(S), sfx.sell); break;
      case 'deselect': selected = null; render(); break;
      case 'sell-selected':
        if (selected !== null) { act(sim.sell(S, selected % C.maxW, Math.floor(selected / C.maxW)), sfx.sell); selected = null; render(); }
        break;
      case 'choice': {
        const msg = sim.resolveChoice(S, b.dataset.ev, +b.dataset.choice);
        $('#modal').innerHTML = `<div class="m-icon">${DCB.EVENTS[b.dataset.ev].icon}</div><h2>${DCB.EVENTS[b.dataset.ev].title}</h2><p class="outcome">${esc(msg)}</p><button class="btn primary" data-action="close">Continue</button>`;
        $('#modal button').focus();
        break;
      }
      case 'answer': {
        const res = sim.answerQuiz(S, +b.dataset.q, +b.dataset.choice);
        (res.correct ? sfx.good : sfx.error)();
        document.querySelectorAll('.answer').forEach((a) => {
          a.disabled = true;
          if (+a.dataset.choice === DCB.QUIZ[+b.dataset.q].c) a.classList.add('right');
          else if (a === b) a.classList.add('wrong');
        });
        $('#modal').insertAdjacentHTML('beforeend', `<p class="${res.correct ? 'reward' : 'err'}">${res.correct ? `Correct! +${money(sim.quizReward(S))} and +2 reputation.` : `Not quite. The answer is: ${esc(res.answer)}`}</p><div class="lesson-box">📘 ${esc(res.explain)}</div><button class="btn primary" data-action="close">Continue</button>`);
        $('#modal button[data-action="close"]').focus();
        break;
      }
    }
  });

  $('#tool-sell').addEventListener('click', () => { tool = tool === 'sell' ? null : 'sell'; selected = null; paletteDirty = true; render(); });
  $('#toggle-heat').addEventListener('change', (e) => { heatmap = e.target.checked; render(); });
  $('#btn-sound').addEventListener('click', () => { sound = !sound; renderStats(); });
  $('#btn-help').addEventListener('click', () => { if (!modalOpen) showHelp(false); });
  $('#btn-new').addEventListener('click', () => {
    if (modalOpen) return;
    openModal(`<div class="m-icon">↺</div><h2>Start over?</h2><p>Your current data center will be lost.</p>
      <div class="actions"><button class="btn danger" data-action="new">Start a new game</button><button class="btn ghost" data-action="close">Cancel</button></div>`);
  });

  const floor = $('#floor');
  floor.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.tile');
    if (!t) return;
    e.preventDefault();
    painting = !!tool;
    onTile(+t.dataset.i, false);
  });
  floor.addEventListener('pointermove', (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const t = el && el.closest('.tile');
    const i = t ? +t.dataset.i : null;
    if (i !== hoverIdx) {
      hoverIdx = i;
      if (painting && i !== null && e.buttons) onTile(i, true);
      renderFloor();
    }
    if (t) showTileTip(i, e);
  });
  floor.addEventListener('pointerleave', () => { hoverIdx = null; hideTip(); renderFloor(); });
  window.addEventListener('pointerup', () => { painting = false; });

  /* ---------- tooltip ---------- */
  const tipEl = $('#tooltip');
  function placeTip(e) {
    const r = tipEl.getBoundingClientRect();
    let x = e.clientX + 14;
    let y = e.clientY + 14;
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 14;
    tipEl.style.left = `${Math.max(8, x)}px`;
    tipEl.style.top = `${Math.max(8, y)}px`;
  }
  function showTip(html, e) {
    tipEl.innerHTML = html;
    tipEl.hidden = false;
    placeTip(e);
  }
  function hideTip() { tipEl.hidden = true; }
  function showTileTip(i, e) {
    const t = S.tiles[i];
    const x = i % C.maxW;
    const y = Math.floor(i / C.maxW);
    if (x >= S.w || y >= S.h) return showTip('🔒 Not built out yet. Use <b>Expand floor</b>.', e);
    if (!t) return tool ? hideTip() : showTip(`Empty floor · ~${Math.round(tileTemp(i))} °C`, e);
    const d = EQ[t.type];
    const heat = DCB.heatOf(d);
    let h = `<b>${d.name}</b>`;
    if (t.status === 'broken') h += '<br>🔴 Broken, awaiting repair';
    if (heat > 0) h += `<br>🌡️ ${t.temp.toFixed(1)} °C · ${Math.round(t.cool * 100)}% cooled`;
    if (d.cooling) h += `<br>❄️ ${d.cooling} kW, range ${d.radius}`;
    showTip(h, e);
  }
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el) showTip(esc(el.dataset.tip).replace(/\n/g, '<br>'), e);
  });
  document.addEventListener('pointermove', (e) => {
    if (!tipEl.hidden && e.target.closest && e.target.closest('[data-tip]')) placeTip(e);
  });
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el && !el.contains(e.relatedTarget)) hideTip();
  });

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (modalOpen) {
      if (e.key === 'Escape' && $('#modal [data-action="close"]')) closeModal();
      return;
    }
    if (e.key === ' ') { e.preventDefault(); speed = speed ? 0 : 1; renderStats(); }
    else if (['1', '2', '3'].includes(e.key)) { speed = +e.key; renderStats(); }
    else if (e.key === 'Escape') { tool = null; selected = null; paletteDirty = true; render(); }
    else if (e.key.toLowerCase() === 'h') { heatmap = !heatmap; $('#toggle-heat').checked = heatmap; render(); }
  });

  /* ---------- sizing ---------- */
  function resize() {
    const wrap = $('#floor-wrap');
    const w = wrap.clientWidth - 16;
    const size = Math.max(24, Math.min(76, Math.floor(w / visW()) - 3));
    document.documentElement.style.setProperty('--tile', `${size}px`);
  }
  window.addEventListener('resize', resize);

  /* ---------- loop ---------- */
  let acc = 0;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1000, now - last);
    last = now;
    if (!modalOpen && !S.pending.length && speed > 0 && !S.lost) {
      acc += dt;
      let n = 0;
      let ticked = false;
      while (acc >= SPEED_MS[speed] && n < 6) {
        acc -= SPEED_MS[speed];
        n++;
        const hadLog = S.log[0];
        sim.tick(S);
        ticked = true;
        if (S.log[0] !== hadLog && S.log[0].kind === 'bad') sfx.error();
        if (S.pending.length) { acc = 0; break; }
      }
      if (ticked) {
        if (S.day !== lastSavedDay) { lastSavedDay = S.day; save(); }
        render();
      }
    } else acc = 0;
    showPending();
    const h = $('#hint');
    if (h.dataset.flash && Date.now() - h.dataset.flash > 3000) { delete h.dataset.flash; cache.delete(h); renderHint(); }
    requestAnimationFrame(frame);
  }

  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  // Boot
  S = load() || null;
  if (S) resize();
  if (S) {
    render();
    lastSavedDay = S.day;
    speed = 0;
    openModal(`<div class="m-icon">🖥️</div><h2>Welcome back, Boss</h2><p>Your data center on day ${S.day} is paused and waiting for you.</p>
      <p class="muted">${sim.rank(S)} · ${money(S.money)} · ${S.contracts.length} clients</p>
      <div class="actions"><button class="btn primary" data-action="close">Resume</button><button class="btn ghost" data-action="new">New game</button></div>`);
  } else {
    S = sim.newGame();
    resize();
    render();
    showHelp(true);
  }
  requestAnimationFrame(frame);
  // expose for debugging in the console
  window.dcbState = () => S;
})();
