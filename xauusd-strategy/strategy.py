"""XAU/USD "Snap-Back" strategy: RSI(2) pullback in the direction of the 4H trend.

Rules (all on 4-hour candles, signals evaluated on the CLOSE of a bar):

  LONG  setup: close > EMA(50)  and  RSI(2) < 5
  SHORT setup: close < EMA(50)  and  RSI(2) > 95

  Entry : market order at the open of the next 4H bar
  Stop  : entry -/+ 2 x ATR(14) (ATR of the signal bar), placed immediately
  Exit  : on the first 4H close back above EMA(5) (long) / below EMA(5) (short)
  Time  : close the trade after 30 bars (5 days) if neither stop nor exit hit
  One position at a time, no pyramiding.

Usage:
  python strategy.py                         # full report on data/xauusd_1h.csv
  python strategy.py --csv my_broker.csv     # any CSV with time,open,high,low,close
  python strategy.py --cost 0.6 --trades trades.csv

Not financial advice. Past performance does not guarantee future results.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass, asdict

import numpy as np
import pandas as pd


@dataclass
class Params:
    timeframe: str = "4h"
    trend_ema: int = 50
    rsi_len: int = 2
    rsi_extreme: float = 5.0   # long below this, short above 100 - this
    atr_len: int = 14
    stop_atr: float = 2.0
    exit_ema: int = 5
    max_bars: int = 30
    cost: float = 0.40         # round-trip spread + slippage in USD per ounce
    allow_shorts: bool = True


# --------------------------------------------------------------------------- indicators

def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def rsi(close: pd.Series, n: int) -> pd.Series:
    """Wilder's RSI."""
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn)


def atr(df: pd.DataFrame, n: int) -> pd.Series:
    prev = df.close.shift()
    tr = pd.concat([df.high - df.low, (df.high - prev).abs(), (df.low - prev).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


# --------------------------------------------------------------------------- data

def load(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=["time"]).set_index("time").sort_index()
    return df[["open", "high", "low", "close"]].astype(float)


def resample(df: pd.DataFrame, tf: str) -> pd.DataFrame:
    agg = {"open": "first", "high": "max", "low": "min", "close": "last"}
    return df.resample(tf).agg(agg).dropna()


def add_indicators(bars: pd.DataFrame, p: Params) -> pd.DataFrame:
    bars = bars.copy()
    bars["trend"] = ema(bars.close, p.trend_ema)
    bars["rsi"] = rsi(bars.close, p.rsi_len)
    bars["atr"] = atr(bars, p.atr_len)
    bars["exit"] = ema(bars.close, p.exit_ema)
    long_sig = (bars.close > bars.trend) & (bars.rsi < p.rsi_extreme)
    short_sig = (bars.close < bars.trend) & (bars.rsi > 100 - p.rsi_extreme)
    bars["signal"] = np.where(long_sig, 1, np.where(short_sig & p.allow_shorts, -1, 0))
    return bars


# --------------------------------------------------------------------------- backtest

def backtest(df: pd.DataFrame, p: Params = Params()) -> pd.DataFrame:
    """Run the strategy on 1H (or finer) OHLC data. Returns one row per closed trade.

    Stop fills are pessimistic: if a bar gaps through the stop we fill at the open.
    When a bar touches the stop, the stop is assumed to have been hit first.
    """
    b = add_indicators(resample(df, p.timeframe), p)
    o, h, l, c = b.open.values, b.high.values, b.low.values, b.close.values
    a, x, sig, idx = b.atr.values, b.exit.values, b.signal.values, b.index
    bar_len = pd.Timedelta(p.timeframe)  # exits are stamped with the close time of their bar
    warmup = max(p.trend_ema, p.atr_len) * 2
    trades = []
    i = warmup
    while i < len(b) - 1:
        side = sig[i]
        if side == 0:
            i += 1
            continue
        entry = o[i + 1]
        risk = p.stop_atr * a[i]
        stop = entry - side * risk
        exit_px = reason = None
        j = i + 1
        while j < len(b):
            if side == 1 and l[j] <= stop:
                exit_px, reason = min(stop, o[j]), "stop"
            elif side == -1 and h[j] >= stop:
                exit_px, reason = max(stop, o[j]), "stop"
            elif (side == 1 and c[j] > x[j]) or (side == -1 and c[j] < x[j]):
                exit_px, reason = c[j], "target"
            elif j - i >= p.max_bars:
                exit_px, reason = c[j], "time"
            if exit_px is not None:
                break
            j += 1
        if exit_px is None:  # still open at end of data
            break
        pnl = (exit_px - entry) * side - p.cost
        trades.append(dict(entry_time=idx[i + 1], exit_time=idx[j] + bar_len, side="long" if side == 1 else "short",
                           entry=round(entry, 2), stop=round(stop, 2), exit=round(exit_px, 2), reason=reason,
                           bars=j - i, pnl_usd_per_oz=round(pnl, 2), r=round(pnl / risk, 3)))
        i = j + 1
    return pd.DataFrame(trades)


def stats(t: pd.DataFrame) -> dict:
    if t.empty:
        return dict(trades=0)
    win = t.r > 0
    eq = t.r.cumsum()
    gross_loss = -t.r[~win].sum()
    # longest run of consecutive losers
    streak = (~win).astype(int).groupby(win.cumsum()).sum().max()
    return {
        "trades": len(t),
        "win_rate_%": round(win.mean() * 100, 1),
        "profit_factor": round(t.r[win].sum() / gross_loss, 2) if gross_loss else float("inf"),
        "avg_win_R": round(t.r[win].mean(), 2),
        "avg_loss_R": round(t.r[~win].mean(), 2) if (~win).any() else 0.0,
        "expectancy_R": round(t.r.mean(), 3),
        "total_R": round(t.r.sum(), 1),
        "max_drawdown_R": round((eq.cummax() - eq).max(), 1),
        "max_losing_streak": int(streak),
        "avg_bars_held": round(t.bars.mean(), 1),
    }


# --------------------------------------------------------------------------- CLI

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", default="data/xauusd_1h.csv")
    ap.add_argument("--start", default="2021-01-01", help="skip earlier data (PAXG was illiquid in 2020)")
    ap.add_argument("--split", default="2024-01-01", help="in-sample / out-of-sample boundary")
    ap.add_argument("--cost", type=float, default=Params.cost)
    ap.add_argument("--long-only", action="store_true")
    ap.add_argument("--trades", help="write the trade list to this CSV")
    a = ap.parse_args()

    p = Params(cost=a.cost, allow_shorts=not a.long_only)
    df = load(a.csv)
    df = df[df.index >= a.start]
    pd.set_option("display.width", 160)

    print("Parameters:", asdict(p))
    t = backtest(df, p)
    t["year"] = pd.to_datetime(t.entry_time).dt.year
    print(f"\nData {df.index[0]:%Y-%m-%d} -> {df.index[-1]:%Y-%m-%d}\n")
    table = {"ALL": stats(t),
             f"in-sample <{a.split[:4]}": stats(t[t.entry_time < a.split]),
             f"out-of-sample >={a.split[:4]}": stats(t[t.entry_time >= a.split]),
             "longs": stats(t[t.side == "long"]),
             "shorts": stats(t[t.side == "short"])}
    table |= {str(y): stats(g) for y, g in t.groupby("year")}
    print(pd.DataFrame(table).T.to_string())
    print("\nExit reasons:", t.reason.value_counts().to_dict())
    if a.trades:
        t.drop(columns="year").to_csv(a.trades, index=False)
        print(f"Trade list written to {a.trades}")


if __name__ == "__main__":
    main()
