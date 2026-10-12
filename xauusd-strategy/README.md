# XAU/USD "Snap-Back" — 4H pullback strategy for gold

A short swing strategy (trades last ~½–2 days) that buys sharp dips in an uptrend and sells
sharp rallies in a downtrend on the **4-hour** chart. It is built for a **high win rate**
and backtested on 2021–2026 hourly gold data.

> **Not financial advice.** This is a research tool. A backtest is not a promise; trade it
> on a demo account first and only risk money you can afford to lose.

## The rules

All signals are checked on the **close of a 4H candle**.

| | Long | Short |
| --- | --- | --- |
| Trend filter | Close **above** EMA(50) | Close **below** EMA(50) |
| Trigger | RSI(2) **< 5** | RSI(2) **> 95** |
| Entry | Market order at the open of the next 4H candle | same |
| Stop loss | Entry − 2 × ATR(14) | Entry + 2 × ATR(14) |
| Take profit | First 4H **close above EMA(5)** | First 4H **close below EMA(5)** |
| Time stop | Close after 30 candles (5 days) | same |

One position at a time. Don't add to a trade and don't move the stop further away.

**Position size:** risk a fixed **0.5–1 % of the account per trade**, measured to the stop:
`ounces = (account × risk%) / (2 × ATR)`. One standard lot is 100 oz. Example: a $10,000
account at 1 % risk with ATR = $12 gives `100 / 24 ≈ 4 oz = 0.04 lots`.

## Backtest results (with costs)

Data: hourly PAXG/USDT, 2021-01-01 → 2026-10-12 (PAXG is tokenised gold, 1 token = 1 oz,
and tracks spot XAU/USD). Costs: $0.40/oz round trip. **R** = the risk taken on a trade
(2 × ATR), so +0.36 R means a win of 0.36 × the amount risked.

| Period | Trades | Win rate | Profit factor | Avg win | Avg loss | Expectancy | Max DD |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **All 2021–2026** | 135 | **71.9 %** | 1.84 | +0.36 R | −0.50 R | +0.12 R | 2.8 R |
| In-sample 2021–23 (tuned here) | 69 | 69.6 % | 1.50 | +0.30 R | −0.45 R | +0.07 R | 2.8 R |
| **Out-of-sample 2024–26** (unseen) | 66 | **74.2 %** | 2.20 | +0.42 R | −0.55 R | +0.17 R | 1.8 R |
| Longs only | 72 | 63.9 % | 1.17 | | | +0.03 R | 5.5 R |
| Shorts only | 63 | 81.0 % | 3.47 | | | +0.22 R | 1.4 R |

By year: 2021 54.5 % · 2022 72.4 % · 2023 83.3 % · 2024 72.0 % · 2025 66.7 % · 2026 85.0 %.
Doubling costs to $0.80/oz still gives PF 1.70 and the same win rate.

Only 15 of 135 trades hit the hard stop. Most losers are closed early by the EMA(5) exit,
which is why the average loss is ~0.5 R and not 1 R.

## What you should know before trading it

1. **Win rate ≠ profit.** Winners are small (≈ 0.36 R) and losers about 1.4× larger. The
   strategy only makes money because it wins ~70 % of the time. If the win rate drops
   below ~58 %, it stops making money.
2. **The win rate holds up; the profit is fragile.** Across 18 nearby parameter settings
   (RSI 5/10/15, EMA 50/100, stop 2–4 ATR) the win rate stayed at **65–74 %** in every
   case. The profit factor did not: several settings broke even or lost money out of sample.
   The settings here are the profitable corner. Don't "optimise" them further on the same data.
3. **Not every year reaches 60 %.** 2021 came in at 54.5 % and lost a little.
4. **Longs are the weak side.** Most of the profit came from shorts. `--long-only` is
   barely positive. Keep both sides on.
5. **Sample size.** 135 trades, about 2 per month. That's enough to see a tendency, not
   enough to be certain. Expect losing streaks of 4+ trades.
6. **Your broker's data differs.** Spreads, swap fees and weekend gaps (PAXG trades 24/7,
   spot gold doesn't) all shift results. Re-run the backtest on your broker's own data.
7. **Intraday (1H) version tested worse:** about 61 % wins out of sample with weaker
   profit, so 4H is the recommended timeframe.

## Variant B: fixed 1:2 risk/reward

Same entries, but every trade ends at **−1R** (stop, 2 × ATR) or **+2R** (take-profit at
2 × the risk). No EMA exit and no time limit.

```bash
python strategy.py --target-rr 2 --stop-atr 2 --max-bars 100000
```

| Period | Trades | Win rate | Profit factor | Expectancy | Max DD | Worst losing streak |
| --- | --- | --- | --- | --- | --- | --- |
| All 2021–2026 | 105 | 41.9 % | 1.41 | **+0.24 R** | 6.1 R | 6 |
| In-sample 2021–23 | 53 | 37.7 % | 1.18 | +0.11 R | 6.1 R | 6 |
| Out-of-sample 2024–26 | 52 | 46.2 % | 1.69 | +0.37 R | 4.0 R | 4 |

**Why not 60 % at 1:2?** I tested 46 combinations of entry type (RSI pullback, breakout,
EMA touch, RSI reversal, EMA cross), timeframe (1H/4H/1D) and stop width (1–3 ATR). All
used a fixed 1R stop and 2R target. None reached 60 % wins in both periods. The best were
55 % in-sample and 56 % out-of-sample, and never the same setup. Getting 60 % at 1:2 would
mean +0.8 R per trade. On random price moves a 2R target is hit before a 1R stop only
about **33 %** of the time, so 42–46 % is already a real edge. Be wary of anyone who
promises 60 %+ at 1:2 without trade-by-trade proof on unseen data.

**A vs B:** Variant A wins more often (72 %) and has smaller drawdowns, but makes only
+0.12 R per trade. Variant B wins less often (42 %) but makes about twice as much per trade
(+0.24 R). Losing streaks of 6 or more are normal in B, so size it at ≤ 1 % risk per trade.
In B, longs did better (45.6 % wins, +0.35 R) than shorts (37.5 %, +0.11 R).

## Intraday research (15-minute chart, 2–3 trades a day)

I tested a 2–3 trades/day version on 15-minute candles, 2021 → Oct 2026. Rules for the test:
- **Hours:** weekend bars removed, since spot gold is closed Friday 21:00 to Sunday 22:00 UTC.
- **Overnight:** every trade closed by 20:45 UTC.
- **Exits:** fixed stop and target; if a candle touches both, the stop counts as hit first.

Setups tested, 144 combinations in total:
- **Session opening-range breakout:** a break of the first 30 or 60 minutes' range at the London open (07:00 UTC) or New York open (13:30 UTC).
- **Asian-range breakout:** a break of the 00:00–07:00 UTC range during the London session.
- **Trend pullback:** RSI(2) dips or spikes during 07:00–20:00 UTC in the direction of the 1-hour trend.
- **Settings:** stops of 1, 1.5 or 2 × ATR, or based on the range; targets at 1:1, 1:1.5, 1:2 and 1:3.

**Result: none of the 144 combinations made money in both periods with $0.40/oz costs.**
The best signal (pullback, RSI(2) < 10 / > 90, 1 ATR stop, 1:1.5 target, ~1.9 trades/day)
has a small edge **before costs**, but intraday stops are only $2–8 wide, so the spread
takes most of it:

| Round-trip cost per oz | Win rate | Expectancy | R per week | Losing weeks |
| --- | --- | --- | --- | --- |
| $0.00 | 45 % | +0.12 R | +1.16 R | 40 % |
| $0.10 (raw-spread ECN) | 45 % | +0.09 R | +0.87 R | 44 % |
| $0.20 | 45 % | +0.06 R | +0.58 R | 45 % |
| $0.40 (typical retail) | 45 % | +0.00 R | +0.01 R | 54 % |

Even at $0.10 that is roughly **0.9 % a week at 1 % risk per trade**, and almost half of all
weeks lose money. 5 % a week would need ~5–6 % risk per trade, which a normal losing streak
would destroy. The 5-minute chart would be worse still: stops get smaller while the spread
stays the same. Spreads and costs decide intraday gold trading, so measure your broker's
real cost per trade before trusting any intraday backtest. These numbers use PAXG data, and
its intraday price action is not identical to spot XAU/USD.

Download intraday data with `python fetch_data.py --interval 15m --start 2021-01-01`.

## Files

| File | Purpose |
| --- | --- |
| `strategy.py` | Indicators, signals, backtester and report (`python strategy.py --help`) |
| `fetch_data.py` | Downloads hourly gold (PAXG/USDT) data to `data/xauusd_1h.csv` |
| `xauusd_snapback.pine` | TradingView Pine v5 version with alerts. Use it on a XAUUSD **4H** chart. Set "Fixed target" = 2 for variant B |
| `test_strategy.py` | Sanity tests (no look-ahead, consistent trades) |

## How to run

```bash
pip install pandas numpy
python fetch_data.py                       # ~54k hourly bars
python strategy.py                         # full report
python strategy.py --cost 0.8              # stress-test costs
python strategy.py --trades trades.csv     # export every trade
python strategy.py --csv my_mt5_xauusd.csv # your broker export: time,open,high,low,close (UTC)
python -m unittest test_strategy.py
```
