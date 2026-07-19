# air-bitrage

An online marketplace for everything at the gate and beyond.

## Overview

Air-bitrage

Airline travel is full of mismatched preferences and zero mechanism to resolve them. The person in 14B would happily take a later flight for $150 but has no way to find out if anyone's offering. The family in row 20 is separated across three seats but can't negotiate a swap without awkwardly tapping strangers on the shoulder. The passenger in 9C just wants the person ahead of them to not recline for four hours and would genuinely pay to make that happen. Air-bitrage is the marketplace that makes all of this possible.
The app is a peer-to-peer exchange for airline travel preferences — essentially Craigslist for everything that happens at the gate and beyond. Passengers on the same flight can post offers, requests, and swaps: seat trades, recline agreements, bump negotiations, upgrade splits, or voluntary rebooking deals. The airline has already priced the seat; Air-bitrage lets passengers price everything else.

Key use cases:
-Seat swaps — trade seats with someone nearby so families can sit together, or so you can get a window
Recline agreements — pay (or get paid) to keep the seat in front of you upright
-Voluntary rebooking — offer to take a later flight in exchange for compensation, negotiated directly with other passengers or surfaced when airlines are oversold
Lounge access splits — day passes resold peer-to-peer at a discount
-Upgrade brokering — someone with miles or a confirmed upgrade offers partial value to another passenger

Commercial potential is real, though the path matters. The peer-to-peer transaction layer takes a small platform fee on every completed deal — low friction, high volume on busy routes. The more interesting play is on the voluntary rebooking side: airlines already pay passengers to give up seats, but the process is opaque and chaotic (the gate agent with a microphone). Air-bitrage could partner directly with airlines as a structured, app-based bump marketplace, taking a cut of deals facilitated. That's a B2B revenue line with serious scale potential. Airlines benefit because it's faster, quieter, and surfaces the passengers most willing to rebook — which is exactly who they want. Or they’ll shut it down and have to internalize it, which might not be the worst thing either.


## Data

All marketplace state lives in `data/db.json` (gitignored). The file is created on first
launch with a seeded demo flight board (UA1492) so the app isn't empty; delete the `data/`
folder any time to reset to a fresh demo state.

## Setup

No dependencies to install — the server is Ruby standard library only (macOS ships with
everything needed).

```
ruby server.rb
```

Then open http://localhost:4747. Use `PORT=8080 ruby server.rb` to run on a different port.

## Usage

- **Find your flight** — enter a flight number and date on the homepage to open that
  flight's board (or click into a board that already has action).
- **Post a listing** — offer or seek a seat swap, recline agreement, voluntary rebooking,
  lounge pass, upgrade, or anything else. Price is optional.
- **Reply and negotiate** — anyone on the flight can reply, with an optional counter-offer.
- **Make the deal** — the poster accepts a reply; the deal closes at the reply's
  counter-offer price (or the listing price), and the platform takes a 5% fee.

This is an MVP: no accounts or auth (anyone can accept a deal on any listing), no payments
(the fee is computed and displayed, not collected), and no real flight validation.

## Project structure

- `server.rb` — WEBrick server: static file serving + JSON REST API + seed data
- `public/` — frontend (hash-routed single-page app: `index.html`, `app.js`, `styles.css`)
- `data/db.json` — runtime datastore (gitignored, auto-created)
- `render.yaml` / `Gemfile` — deploy configuration (only needed for hosting, not local use)

## Deploying

The repo is set up to deploy on [Render](https://render.com) straight from GitHub:

1. Go to [dashboard.render.com](https://dashboard.render.com) and sign in with GitHub.
2. Click **New +** → **Blueprint**, and select the `air-bitrage` repo. `render.yaml`
   configures everything (start command, `BIND=0.0.0.0`, free plan).
3. Approve it — you'll get a public URL like `https://air-bitrage.onrender.com`.

After that, every `git push` to `main` automatically redeploys the live site.

Free-tier caveats: the service sleeps after ~15 minutes idle (first visitor waits a few
seconds while it wakes), and `data/db.json` resets on every restart or redeploy since
free instances have no persistent disk. A paid instance with a disk fixes both.

## Contact

Tracey Mangin — traceymangin@gmail.com
