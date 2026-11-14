# Token Radar

A token launch radar: 289 pre-token protocols from one frozen DefiLlama snapshot, ranked by an
implied value the model derives from the snapshot's own figures — and a farm plan for each one.

## What it does

`main.ts` (Node 22, standard library only) reads the sealed snapshot at `/input/snapshot.json`,
scores every rankable pre-token protocol, and writes:

- `/output/board.json` — the ranked board (289 rows: all 40 watchlist protocols plus every other
  rankable pre-token protocol the snapshot holds)
- `/output/data.js` — the same board, compact, for the dashboard
- `/output/dashboard/` — the static page: sortable and filterable board, a detail view per
  protocol, a live-token view, and the model with its calibration table
- `/output/screenshots/` — three screenshots of the dashboard (board, detail, filtered)
- `/output/dossier.json` — the judge's dossier, built with the vendored make.fun library

## The model (radar-2)

```
implied = round( tvl_usd x multiple x growth x age x chains )
```

- **multiple** — the market's own price for this kind of protocol: the median market-cap-per-TVL
  of the live-token protocols in the same category, shrunk toward the global median
  (0.24x, from 118 live protocols) when the category has few live protocols, and clamped to
  [0.02, 2.0] so one outlier cannot set the price for a whole category. No name is special-cased.
- **growth** — `1 + clamp(change_7d, -60, 120) / 100 x 0.5`.
- **age** — a track record with no token yet: 0.75 for a newborn protocol, rising to 1.00 at two
  years, then easing by up to 15% over three more years (a very long tokenless run reads as a team
  in no hurry to launch). Unknown age counts as one year.
- **chains** — `1 + 0.02` per extra chain, up to four.

A protocol is pre-token when its record carries no token (no market cap, no CoinGecko id, no
symbol). Live-token protocols are set aside with their market caps shown — the market's own
values, never mixed into the ranking. The dashboard states the formula, shows the calibration
table, and recomputes every row from the same figures, so the page's code and the board's data
are visibly the same arithmetic.

## Farm plans

Each row carries seven steps derived from its own record (category, chains, TVL, age): a fresh
wallet, the category's main position with a capital sized to the protocol's TVL, a different
weekly touchpoint for the same category, a hold sized to the protocol's age, a weekly check of
the protocol's own points page, claim safety (only from the link the protocol publishes, never
pay to claim), and a farm log with an exit plan. Every step names its cost and its time.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

## Check it

```sh
node cli/makefun.mjs check --kit <kit> --repo . --transcripts transcripts.tar.gz
```

## A note on the data

The snapshot says a protocol *records* no token, never that it has none: the record cannot prove
a token does not exist. Implied value is a model, not a price, and not a prediction of whether or
when a token is issued.
