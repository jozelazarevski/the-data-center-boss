# The Data Center Boss

A data center tycoon that teaches you how one is built. Pick a site, buy a hangar, then grow a server closet into a megawatt AI campus, one real constraint at a time.

**Play:** https://jozelazarevski.github.io/the-data-center-boss/

## What you learn

- **Site and building:** choosing a market (power price, grid, fiber, climate, water, land, incentives), due diligence, buying a hangar, warehouse or new build, permits.
- **Level 1, server closet (Tier I):** power, cooling, network, UPS, in the right order.
- **Level 2, small data center (Tier II):** transformer, generators, CRACs, containment, building management, N+1, commissioning L1–L3.
- **Level 3, enterprise site (Tier III):** chilled water, N+1 everywhere, diverse fiber, fire and security, commissioning L4–L5, Tier certification.
- **Level 4, AI campus:** substation, liquid cooling, GPU racks, a second hall, renewable power.

Every piece of equipment is tagged **JCI**, **JCI option** or **Non-JCI**, with example products and vendors. Each level ends with failure drills and a short knowledge check. Progress saves in your browser.

## How it plays

- **Site choice matters.** The site picker projects PUE, power bill, revenue, free-cooling hours and water use for each market, and the Handbook compares your build across all four markets.
- **See it before you buy.** The lesson card previews what a purchase does to PUE, facility load, grid headroom and profit, with a payback estimate.
- **Downtime costs money.** Alerts that wait too long and failed drills pay SLA credits to customers. Overdue racks stop earning until a technician starts work.
- **Products differ.** The BMS choice sets technician response time and how early events are forecast. The fire system decides whether a rack fire leaves servers wet. Chillers differ in efficiency, water use and maintenance.
- **Operating events.** From level 2, heat waves, grid curtailment, storms, water restrictions, fiber cuts and planned maintenance arrive with a forecast and test your N+1 decisions for real. Each market has its own risks.
- **Fast-forward.** A 3x button speeds up waits for permits, studies and savings, and switches itself off when something needs you.
- **Report card.** Finishing the campaign gives a grade, six stars, a JCI ledger and a copyable summary. Your best run is remembered in this browser.

Figures are illustrative and simplified for play. Product names are used for education; this project is not affiliated with Johnson Controls or any other vendor.

## Files

- `src/game.html`: the game source (also published as a Claude artifact, so it has no `<html>`/`<head>`/`<body>` wrapper).
- `index.html`: the standalone page GitHub Pages serves. Generated; don't edit by hand.
- `build.sh`: rebuilds `index.html` from `src/game.html`. Run `./build.sh` after every change to the source.

## Deploy

GitHub Pages is on, with **Settings → Pages → Source** set to **GitHub Actions**. Every push to `main` runs `.github/workflows/static.yml`, which publishes the repository root, so `index.html` must be rebuilt with `./build.sh` before you commit. The site updates a minute or two after the run finishes. You can also start the workflow by hand from the Actions tab.

Pages on a private repository needs a paid GitHub plan, so keep the repository public on a free account.

## Run locally

Open `index.html` in a browser, or serve the folder (for example `npx http-server .`). It needs an internet connection to load three.js and the fonts from their CDNs. If a network blocks the CDN or WebGL is unavailable, the page says so instead of staying blank.
