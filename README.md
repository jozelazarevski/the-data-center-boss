# The Data Center Boss

A data center tycoon that teaches you how one is built. Pick a site, buy a hangar, then grow a server closet into a megawatt AI campus, one real constraint at a time.

**Play:** https://jozelazarevski.github.io/the-data-center-boss/ (once GitHub Pages is on, see below)

## What you learn

- **Site and building:** choosing a market (power price, grid, fiber, climate, water, land, incentives), due diligence, buying a hangar, warehouse or new build, permits.
- **Level 1, server closet (Tier I):** power, cooling, network, UPS, in the right order.
- **Level 2, small data center (Tier II):** transformer, generators, CRACs, containment, building management, N+1, commissioning L1–L3.
- **Level 3, enterprise site (Tier III):** chilled water, N+1 everywhere, diverse fiber, fire and security, commissioning L4–L5, Tier certification.
- **Level 4, AI campus:** substation, liquid cooling, GPU racks, a second hall, renewable power.

Every piece of equipment is tagged **JCI**, **JCI option** or **Non-JCI**, with example products and vendors. Each level ends with failure drills and a short knowledge check. Progress saves in your browser.

Figures are illustrative and simplified for play. Product names are used for education; this project is not affiliated with Johnson Controls or any other vendor.

## Files

- `src/game.html`: the game source (also published as a Claude artifact, so it has no `<html>`/`<head>`/`<body>` wrapper).
- `index.html`: the standalone page GitHub Pages serves. Generated; don't edit by hand.
- `build.sh`: rebuilds `index.html` from `src/game.html`. Run `./build.sh` after every change to the source.

## Turn on GitHub Pages

1. Repo **Settings → Pages**.
2. **Source:** Deploy from a branch. **Branch:** `main`, folder `/ (root)`. Save.
3. After a minute or two the game is live at the link above.

Pages on a private repository needs a paid GitHub plan; on a free account, make the repository public first.

## Run locally

Open `index.html` in a browser, or serve the folder (for example `npx http-server .`). It needs an internet connection to load three.js and the fonts from their CDNs.
