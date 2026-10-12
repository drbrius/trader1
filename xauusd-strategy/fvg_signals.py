"""XAU/USD 15-minute fair-value-gap (FVG) retest signals, rated 1-10.

Setup (BUY): a bullish FVG (candle 3 low above candle 1 high, gap >= 0.25 ATR) is retested
for the first time within 48 candles, and the retest candle closes bullish ABOVE the gap.
  Entry  : next candle's open (the scanner shows the signal close as the estimate)
  Stop   : 0.1 ATR below the gap, at least 0.5 ATR away
  Target : 1.5R (or 2R)

Rating = 2 + 2 x (checks passed), checks validated on Jun 2025 -> Oct 2026 data:
  [1] higher-timeframe trend up  (close > EMA200 on 15m, ~EMA50 of the 1H chart)
  [2] local trend up             (close > EMA50)
  [3] at support                 (low touched a confirmed swing level of the last 24h)
  [4] at a $10 round number

  Rating 2-4  : 0-1 checks -> historically 17-43 % wins, losing: do not trade
  Rating 6-10 : 2-4 checks -> 48 % (2025) / 49 % (2026) wins at 1:1.5, +0.11R / +0.19R per trade
  The differences between 6, 8 and 10 are not statistically reliable; treat 6+ as "valid".

Info-only checks (shown, not scored, because they did not help consistently in testing):
previous-day high/low, level strength, relative volume, clear path to target, session.

Usage:
  python fvg_signals.py --live              # pull the last 30 days of 5m candles and scan
  python fvg_signals.py --live --last 10    # show the 10 most recent signals
  python fvg_signals.py --stats             # historical results by rating (data/xauusd_5m.csv)
Not financial advice.
"""
import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "research"))
import confluence as cf  # noqa: E402

TF = "15m"
SCORED = ["htf_trend", "local_trend", "at_sr", "round_number"]
INFO = ["at_prev_day", "sr_strong", "high_volume", "clear_path", "session"]


def scan(b: pd.DataFrame, rr: float = 1.5) -> pd.DataFrame:
    """Return one row per BUY signal with entry estimate, stop, target, checks and rating."""
    ctx, A = cf.context(b, TF)
    idx = np.where(ctx.retest_bull_conf.values)[0]
    x, c, a = ctx.iloc[idx], b.close.iloc[idx], A.iloc[idx]
    out = pd.DataFrame(index=x.index)
    out["entry"] = c.values
    out["stop"] = np.minimum(x.edge_bull.values - 0.1 * a.values, c.values - 0.5 * a.values)
    out["target"] = out.entry + rr * (out.entry - out.stop)
    out["htf_trend"] = (c > x.htf).values
    out["local_trend"] = (c > x.ema50).values
    out["at_sr"] = x.at_sup.values
    out["round_number"] = x.round_sup.values
    out["at_prev_day"] = x.near_pdl.values
    out["sr_strong"] = (x.sup_strength >= 2).values
    out["high_volume"] = (x.rel_trades >= 1.5).values
    out["clear_path"] = (x.room_up >= rr).values
    out["session"] = x.good_session.values
    out["rating"] = 2 + 2 * out[SCORED].sum(axis=1)
    return out


def fetch_recent(days: int = 30) -> pd.DataFrame:
    from fetch_data import fetch_api
    start = datetime.now(timezone.utc) - timedelta(days=days)
    rows = fetch_api("5m", int(start.timestamp() * 1000))
    m5 = pd.DataFrame(rows, columns=["time", "open", "high", "low", "close", "volume", "trades"])
    m5["time"] = pd.to_datetime(m5.time, unit="s")
    return m5.set_index("time").astype(float)


def show(sig: pd.DataFrame, last: int) -> None:
    tick = lambda v: "Y" if v else "-"
    print(f"{'time (UTC)':16} {'rating':>6} {'entry':>9} {'stop':>9} {'target':>9}  "
          f"HTF LOC S/R RND | PDL STR VOL PATH SESS")
    for t, r in sig.tail(last).iterrows():
        flag = "BUY " if r.rating >= 6 else "skip"
        print(f"{t:%Y-%m-%d %H:%M} {flag}{int(r.rating):>2} {r.entry:9.2f} {r.stop:9.2f} {r.target:9.2f}  "
              + "   ".join(tick(r[k]) for k in SCORED) + "  |  "
              + "   ".join(tick(r[k]) for k in INFO))


def stats() -> None:
    b = cf.load_bars(TF)
    s = cf.build_signals(b, TF)
    d = s[s.setup == "fvg_retest_bull_conf"].copy()
    d["rating"] = 2 + 2 * d[SCORED].sum(axis=1)
    col = "r_structure_stop"
    for name, part in [("Jun-Dec 2025", d[d.index < cf.SPLIT]), ("2026", d[d.index >= cf.SPLIT])]:
        print(f"\n{name}: rating -> trades, win rate, average R (1:{cf.RR}, ${cf.COST}/oz cost)")
        for rt, g in part.groupby("rating"):
            print(f"  {int(rt):2d}/10  n={len(g):3d}  win={100 * (g[col] > 0).mean():4.0f}%  exp={g[col].mean():+.2f}R")
        g = part[part.rating >= 6]
        print(f"  >=6    n={len(g):3d}  win={100 * (g[col] > 0).mean():4.0f}%  exp={g[col].mean():+.2f}R")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--live", action="store_true", help="scan the last 30 days of live PAXG candles")
    ap.add_argument("--stats", action="store_true", help="historical results per rating")
    ap.add_argument("--last", type=int, default=15)
    ap.add_argument("--rr", type=float, default=1.5)
    a = ap.parse_args()
    if a.stats:
        stats()
        return
    m5 = fetch_recent() if a.live else pd.read_csv(ROOT / "data" / "xauusd_5m.csv", parse_dates=["time"]).set_index("time")
    b = cf.prepare(m5, TF)
    if a.live:  # drop the candle that is still forming, so signals never repaint
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        b = b[b.index + pd.Timedelta(TF.replace("m", "min")) <= now]
    sig = scan(b, a.rr)
    print(f"Data up to {b.index[-1]:%Y-%m-%d %H:%M} UTC (15m candle open time). "
          f"{len(sig)} FVG retest signals; showing the last {min(a.last, len(sig))}.\n"
          f"Prices are PAXG/USDT and can differ from your broker's XAU/USD by a few dollars.\n")
    show(sig, a.last)


if __name__ == "__main__":
    main()
