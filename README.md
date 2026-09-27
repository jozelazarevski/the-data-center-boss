# 🖥️ The Data Center Boss

A browser game where you run your own data center. Build server racks, keep them cool, keep the power on, sign clients, and grow from an empty room into a hyperscaler. The game teaches real data center concepts along the way: PUE, UPS and generators, SLAs and "nines", hot/cold aisles, liquid cooling, RAID, DDoS and more.

## Play

It has no build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```bash
npm start        # serves on http://localhost:8080
```

Your game autosaves in the browser (localStorage).

## How it works

| You manage | What it teaches |
|---|---|
| **Racks, storage, switches** give compute, TB and Gbps for clients | Capacity planning and headroom |
| **Cooling** (CRAC, in-row, liquid CDU) with a range and a COP | Every watt becomes heat. Air can only pull ~15 kW from one rack, so AI racks need liquid |
| **Power**: grid feed, UPS, diesel generator | Why you need *both* a UPS and a generator, and why cooling counts against your feed |
| **Clients** with SLAs (99% to 99.99%) | What "nines" mean in minutes of downtime, and service credits |
| **PUE** in the top bar | Total facility power ÷ IT power, and why efficiency cuts both bills and CO₂ |
| **Technicians** repair broken gear | Failures happen, and hot equipment fails more. N+1 redundancy |
| **Upgrades** (containment, virtualization, free-air cooling, RAID, diverse fiber, renewables…) | Real techniques data centers use |
| **Random events**: outages, squirrels 🐿️, heat waves, DDoS, fiber cuts, ransomware, traffic spikes | Each event explains the real-world lesson |
| **Board meeting pop quizzes** | 20 questions with explanations, and cash for right answers |

There are 12 career goals, with ranks from *Junior Server Wrangler* to *Hyperscale Legend*. Reach **$1,000,000** to win. Go below −$50,000 and you're bankrupt.

**Controls:** click or drag to build · <kbd>Space</kbd> pause · <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> speed · <kbd>H</kbd> heat map · <kbd>Esc</kbd> cancel. Hover anything for an explanation.

## Code layout

- `js/data.js` holds all game content: equipment, upgrades, clients, events, quiz, glossary and goals.
- `js/sim.js` is the simulation, with no DOM. One tick is one in-game hour.
- `js/ui.js` handles rendering, input, modals, sound, save/load and the game loop.
- `css/style.css` holds the styles, including the CSS-drawn equipment.
- `tests/sim.test.js` holds the simulation tests. Run them with `npm test` (Node 18+).
