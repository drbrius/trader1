"""Higher-timeframe trend, price-movement and EMA200 confirmations for the 15m FVG retest,
plus EMA200 setups on their own.

Periods
  P1 = PAXG Jun-Dec 2025   (selection)
  P2 = PAXG 2026           (confirmation)
  P3 = Dukascopy spot XAU/USD Jan 2024 - May 2025 (untouched holdout, only with --holdout)

Selection rule, fixed before looking at the results: a confirmation is accepted only if, in
BOTH P1 and P2, trades WITH it beat trades WITHOUT it by >= 3 percentage points of win rate
AND >= 0.08R per trade, with >= 40 trades on each side. The mirror image (worse by the same
margins in both) marks it as a WARNING. With ~40 checks and ~100-200 trades per group,
3-4 checks can pass by chance, which is why P3 exists.

Higher-timeframe values come from the last fully CLOSED 1H / 4H / daily candle (built from
data/xauusd_1h.csv, weekend hours removed), so nothing looks ahead. Short-side features are the
long-side features computed on the mirrored price series.

Usage (from xauusd-strategy/): python research/mtf_confirmations.py [--holdout]
"""
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "research"))
import confluence as cf  # noqa: E402
from strategy import ema, rsi  # noqa: E402

AGG = {"open": "first", "high": "max", "low": "min", "close": "last"}
MIN_WIN_LIFT, MIN_EXP_LIFT, MIN_N = 3.0, 0.08, 40


# --------------------------------------------------------------------------- data

def closed_hours(df: pd.DataFrame) -> pd.DataFrame:
    wd, hr = df.index.weekday, df.index.hour
    return df[~((wd == 5) | ((wd == 4) & (hr >= 21)) | ((wd == 6) & (hr < 22)))]


def load_15m(path: Path, start: str, end: str | None = None) -> pd.DataFrame:
    m5 = pd.read_csv(path, parse_dates=["time"]).set_index("time")
    m5 = m5[(m5.index >= start) & ((m5.index < end) if end else True)]
    return cf.prepare(m5, "15m")


def load_h1() -> pd.DataFrame:
    h1 = pd.read_csv(ROOT / "data" / "xauusd_1h.csv", parse_dates=["time"]).set_index("time")
    return closed_hours(h1[["open", "high", "low", "close"]])


def mirror(df: pd.DataFrame) -> pd.DataFrame:
    """Flip the price series upside down: bullish features of the mirror = bearish features."""
    m = df.copy()
    m["open"], m["close"] = -df.open, -df.close
    m["high"], m["low"] = -df.low, -df.high
    return m


# --------------------------------------------------------------------------- features (long orientation)

def last_closed(values: pd.Series, length: pd.Timedelta, close_times: pd.DatetimeIndex) -> np.ndarray:
    """Value of the last higher-timeframe candle that had fully closed at each close time."""
    pos = values.index.searchsorted(close_times - length, side="right") - 1
    v = values.values.astype(float)
    return np.where(pos >= 0, v[np.clip(pos, 0, None)], np.nan)


def htf_features(h1: pd.DataFrame, close_times: pd.DatetimeIndex) -> pd.DataFrame:
    out = {}
    for name, rule, offset, length, slope_n in [("1h", None, None, pd.Timedelta("1h"), 24),
                                                ("4h", "4h", None, pd.Timedelta("4h"), 6),
                                                ("1d", "1D", "22h", pd.Timedelta("1D"), 5)]:
        x = h1 if rule is None else h1.resample(rule, offset=offset).agg(AGG).dropna()
        c = x.close
        e50, e200 = ema(c, 50), ema(c, 200)
        cols = {"above_ema50": c > e50, "above_ema200": c > e200, "ema50_over_200": e50 > e200,
                "ema200_rising": e200 > e200.shift(slope_n), "rsi_above_50": rsi(c, 14) > 50,
                "last_candle_bull": c > x.open}
        for k, v in cols.items():
            out[f"{name}_{k}"] = last_closed(v, length, close_times)
    f = pd.DataFrame(out, index=close_times).fillna(0).astype(bool)
    f["all_tf_above_ema200"] = f["1h_above_ema200"] & f["4h_above_ema200"] & f["1d_above_ema200"]
    f["all_tf_above_ema50"] = f["1h_above_ema50"] & f["4h_above_ema50"] & f["1d_above_ema50"]
    return f


def ltf_features(b: pd.DataFrame, A: pd.Series) -> pd.DataFrame:
    c, l = b.close, b.low
    e50, e200 = ema(c, 50), ema(c, 200)
    above = c > e200
    streak = above.groupby((above != above.shift()).cumsum()).cumcount() + 1
    streak = streak.where(above, 0)
    touched_200 = (l <= e200 + 0.3 * A) & above
    f = pd.DataFrame(index=b.index)
    # EMA200 behaviour on the 15m chart
    f["m15_above_ema200"] = above
    f["m15_ema200_rising"] = e200 > e200.shift(12)
    f["m15_ema50_over_200"] = e50 > e200
    f["m15_near_ema200"] = (c - e200).abs() <= 1.0 * A
    f["m15_stretched_from_200"] = (c - e200) > 4.0 * A
    f["m15_bounced_off_200"] = touched_200.rolling(16).max().fillna(0).astype(bool)
    f["m15_fresh_cross_200"] = (streak > 0) & (streak <= 24)
    f["m15_long_above_200"] = streak > 96
    # price movement
    f["up_last_4h"] = c > c.shift(16)
    f["up_last_day"] = c > c.shift(96)
    f["m15_rsi_above_50"] = rsi(c, 14) > 50
    f["higher_lows"] = l.rolling(20).min() > l.shift(20).rolling(20).min()
    return f.fillna(False).astype(bool)


def fvg_features(g: pd.DataFrame, side: str) -> pd.DataFrame:
    f = pd.DataFrame(index=g.index)
    f["strong_gap"] = g[f"{side}_size"] >= 0.5
    f["quick_retest"] = g[f"{side}_age"] <= 12
    f["shallow_retest"] = g[f"{side}_depth"] <= 0.5
    return f


def signals(b: pd.DataFrame, h1: pd.DataFrame, side: int) -> pd.DataFrame:
    """Confirmed FVG retests for one side with every feature attached and the trade result."""
    bb, hh = (b, h1) if side == 1 else (mirror(b), mirror(h1))
    A = cf.atr(bb, 14)
    ctx, _ = cf.context(bb, "15m")
    g = cf.fair_value_gaps(bb, A)
    idx = np.where(g.retest_bull_conf.values)[0]
    idx = idx[idx > 300]
    close_times = b.index + pd.Timedelta("15min")
    feats = pd.concat([htf_features(hh, close_times).set_axis(b.index),
                       ltf_features(bb, A), fvg_features(g, "bull")], axis=1).iloc[idx]
    # the four checks used by the current rating
    x = ctx.iloc[idx]
    feats["rating_htf_trend"] = (bb.close.iloc[idx] > x.htf).values
    feats["rating_local_trend"] = (bb.close.iloc[idx] > x.ema50).values
    feats["rating_at_support"] = x.at_sup.values
    feats["rating_round_number"] = x.round_sup.values
    entry = bb.open.shift(-1).values[idx]
    dist = np.maximum(entry - g.edge_bull.values[idx] + 0.1 * A.values[idx], 0.5 * A.values[idx])
    feats["r"] = cf.simulate(bb, A, idx, np.ones(len(idx), int), dist)
    return feats.dropna(subset=["r"])


# --------------------------------------------------------------------------- reporting

def stat(d: pd.DataFrame) -> tuple:
    return (len(d), 100 * (d.r > 0).mean() if len(d) else np.nan, d.r.mean() if len(d) else np.nan)


def fmt(t: tuple) -> str:
    return f"n={t[0]:3d} {t[1]:4.0f}% {t[2]:+.2f}R" if t[0] else "n=  0"


def feature_table(periods: dict, features: list[str]) -> pd.DataFrame:
    rows = []
    for f in features:
        row = {"feature": f}
        ok, bad = True, True
        for name, d in periods.items():
            w, wo = stat(d[d[f]]), stat(d[~d[f]])
            row[name] = f"{fmt(w)} | without {fmt(wo)}"
            lift_w, lift_e = w[1] - wo[1], w[2] - wo[2]
            row[name + "_lift"] = f"{lift_w:+5.1f}pp {lift_e:+.2f}R"
            if name in ("P1", "P2"):
                enough = w[0] >= MIN_N and wo[0] >= MIN_N
                ok &= enough and lift_w >= MIN_WIN_LIFT and lift_e >= MIN_EXP_LIFT
                bad &= enough and lift_w <= -MIN_WIN_LIFT and lift_e <= -MIN_EXP_LIFT
        row["accepted"] = "YES" if ok else ("WARNING" if bad else "")
        rows.append(row)
    return pd.DataFrame(rows)


def ema200_setups(b: pd.DataFrame, label: str, split: pd.Timestamp) -> None:
    """EMA200 used as the setup itself (long side; short side = mirrored)."""
    print(f"\nEMA200 SETUPS on {label} (stop 1 ATR, ${cf.COST}/oz cost), before | after {split:%Y-%m-%d}")
    for side, bb in [(1, b), (-1, mirror(b))]:
        A = cf.atr(bb, 14)
        c, o, l = bb.close, bb.open, bb.low
        e200 = ema(c, 200)
        above = c > e200
        rising = e200 > e200.shift(12)
        setups = {
            "bounce off rising EMA200": above & rising & (l <= e200 + 0.2 * A) & (c > o),
            "reclaim (cross after 24+ below)": above & (~above.shift(1).fillna(False))
                                               & (~above.shift(1).rolling(24).max().fillna(1).astype(bool)),
            "retest after fresh cross": above & (l <= e200 + 0.2 * A) & (c > o)
                                        & (~above).shift(4).rolling(20).max().fillna(0).astype(bool),
        }
        for name, cond in setups.items():
            idx = np.where(cond.fillna(False).values)[0]
            idx = idx[idx > 400]
            for rr in [1.5, 2.0]:
                cf.RR = rr
                r = cf.simulate(bb, A, idx, np.ones(len(idx), int))
                t = b.index[idx]
                a, z = r[t < split], r[t >= split]
                s = lambda v: f"n={len(v):4d} {100 * np.mean(v > 0):4.0f}% {np.nanmean(v):+.2f}R" if len(v) else "n=0"
                print(f"  {'BUY ' if side == 1 else 'SELL'} {name:32} 1:{rr}  {s(a)} | {s(z)}")
        cf.RR = 1.5


def main() -> None:
    holdout = "--holdout" in sys.argv
    h1 = load_h1()
    b = load_15m(ROOT / "data" / "xauusd_5m.csv", "2025-06-01")
    longs = signals(b, h1, 1)
    shorts = signals(b, h1, -1)
    periods = {"P1": longs[longs.index < cf.SPLIT], "P2": longs[longs.index >= cf.SPLIT]}
    if holdout:
        dk = ROOT / "data" / "xauusd_dk_5m.csv"
        periods["P3"] = signals(load_15m(dk, "2024-01-01", "2025-06-01"), h1, 1)
    features = [c for c in longs.columns if c != "r"]

    print("15m confirmed bullish FVG retest, gap-edge stop, 1:1.5, $0.30/oz")
    for k, d in periods.items():
        print(f"  {k}: {fmt(stat(d))}")
    tab = feature_table(periods, features)
    cols = ["feature"] + [c for c in tab.columns if c.endswith("_lift")] + ["accepted"]
    print("\nLIFT = with confirmation minus without it (win-rate points, R per trade)")
    print(tab[cols].to_string(index=False))
    print("\nDETAIL")
    for _, r in tab.iterrows():
        print(f"  {r.feature:24} " + "  ||  ".join(f"{k} {r[k]}" for k in periods))

    acc = tab[tab.accepted == "YES"].feature.tolist()
    print(f"\nAccepted confirmations: {acc or 'none'}")
    print(f"Warnings: {tab[tab.accepted == 'WARNING'].feature.tolist() or 'none'}")
    if acc:
        for k, d in periods.items():
            pts = d[acc].sum(axis=1)
            print(f"  {k} by number of accepted confirmations: " +
                  "  ".join(f"{p}: {fmt(stat(d[pts == p]))}" for p in range(len(acc) + 1)))

    print("\nSELL side (mirrored, not validated): all signals " +
          f"P1 {fmt(stat(shorts[shorts.index < cf.SPLIT]))} | P2 {fmt(stat(shorts[shorts.index >= cf.SPLIT]))}")

    ema200_setups(b, "15m PAXG", cf.SPLIT)
    h1_full = h1[h1.index >= "2021-01-01"]
    ema200_setups(h1_full, "1H PAXG 2021-2026", pd.Timestamp("2024-01-01"))


if __name__ == "__main__":
    main()
