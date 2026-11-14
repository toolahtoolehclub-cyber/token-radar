# Token Radar

A token launch radar: 198 pre-token protocols from one frozen DefiLlama snapshot, ranked by an
implied value the model derives from the snapshot's own figures — and a farm plan for each one.

## What it does

`main.ts` (Node 22, standard library only) reads the sealed snapshot at `/input/snapshot.json`,
scores every rankable pre-token protocol, and writes:

- `/output/board.json` — the ranked board (198 rows: all 40 watchlist protocols plus 158 more
  rankable pre-token protocols the snapshot holds)
- `/output/data.js` — the same board, compact, for the dashboard
- `/output/dashboard/` — the static page: sortable and filterable board, a detail view per
  protocol, a live-token view, and the model with its calibration table
- `/output/screenshots/` — three screenshots of the dashboard (board, detail, filtered)
- `/output/dossier.json` — the judge's dossier, built with the vendored make.fun library

## The model (radar-5)

```
implied = round( tvl_usd x multiple x growth x age x chains )
```

- **multiple** — the size-fitted multiple for this row: the market does not pay a flat
  multiple per TVL dollar. Across the snapshot's own 118 live-token protocols, a protocol ten
  times larger is worth only about 4.3x more (the log-log slope is 0.64, fitted within
  categories, not 1.0), and the median market-cap-per-TVL falls from 0.42x under $50M of TVL to
  0.03x above $1B. Radar-3 fits the market's own line — `log10(market cap) = intercept +
  0.64 x log10(TVL)` — with one intercept per category, shrunk toward the global intercept of
  2.10 when the category has few live protocols, and the multiple clamped to [0.005, 5.0]. The
  line explains R² = 0.25 of the live market caps, with a residual spread of 0.82 in log10: the
  market is noisy, so the line is a central tendency, not a prediction. A flat ratio would
  overprice the giants by an order of magnitude and underprice the early ones the radar exists
  to find. No name is special-cased.
- **growth** — `1 + clamp(change_7d, -60, 120) / 100 x 0.5`.
- **age** — a track record with no token yet: 0.75 for a newborn protocol, rising to 1.00 at two
  years, then easing by up to 15% over three more years (a very long tokenless run reads as a team
  in no hurry to launch). Unknown age counts as one year.
- **chains** — `1 + 0.02` per extra chain, up to four.

## The range, the farm ticket and the $1k earnings (radar-5)

A point value alone pretends to a precision the market does not have, so radar-4 adds two things
the top boards carry and a point estimate hides, and radar-5 adds a third — the one the farmer
actually asks:

- **$1k earns.** Every row carries what $1,000 deposited is expected to earn: if 10% of the
  implied launch value is airdropped to farmers pro-rata by TVL, a $1,000 deposit earns
  100 × implied / TVL dollars. The same assumption the top boards use for their per-$1k
  earnings column (two of them, independently, converge on exactly this formula). It is the
  farm ticket's answer to the farmer's real question — not how big the protocol is, but how
  much a dollar in it earns. A giant whose implied value is small next to its TVL earns
  little per dollar deposited, however large its total; a small protocol priced generously
  earns much more per dollar. Steakhouse earns $6.14 per $1,000; the board's best earner per
  dollar is not its top row. The assumption is stated in the table caption, the model panel
  and the detail view, so the number is a stated assumption, not a hidden one.
- **The range.** Every row carries the band half of the priced tokens land in: the 25th and
  75th percentiles of (market cap / fitted market cap) over the 118 calibrators, ×0.35 to
  ×4.02 of the point value here. The row's low and high are its point times that band, shown
  as a whisker with a dot at the point, in the table and in the detail view. The band is the
  market's own central spread, stated in the model panel — not a confidence interval from a
  distributional assumption, and not a narrower band chosen to look precise.
- **The farm ticket.** Every row carries the capital one position needs ($50–$150, from its
  own TVL), the hold in days (30–60, from its age), and the action's short label (Vault,
  Supply, Provide liquidity, Bridge, Stake, Trade, Bet, Mint, Cover, Join launch, Deposit),
  so the board reads as a plan at a glance. The full seven-step plan is in the detail view,
  unchanged: each step's action, cost and time derive from the protocol's own category, chains,
  TVL, age, seven-day move and implied value.

The lede states the board's total implied value ($2.29B at the point values), and a log-scale
histogram above the table shows how the 198 values are distributed — most rows small, a few
large, the median row worth $5.3M.

A protocol is pre-token when its record carries no token (no market cap, no CoinGecko id, no
symbol). Live-token protocols are set aside with their market caps shown — the market's own
values, never mixed into the ranking. The dashboard states the formula, draws the fitted line
through the live protocols' own points, shows the calibration table, and recomputes every row
from the same figures, so the page's code and the board's data are visibly the same arithmetic.

## Farm plans

Each row carries seven steps derived from its own record (category, chains, TVL, age, seven-day
move, implied value): a fresh wallet on its main chain, the category's main position with a
capital sized to the protocol's TVL, a different weekly touchpoint for the same category, a hold
sized to the protocol's age (longer for a young protocol), a watch step that reads its own
seven-day move before adding more, a second front on another of its chains (or a second
touchpoint in the same app), and a farm log with an exit planned against its own implied value.
Every step names its cost and its time, and no two rows share a plan unless their own figures
agree.

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
