"""Confluence study: do support/resistance, volume and fair value gaps improve 5m/15m signals?

Signals  : 20 classic candle patterns (see candle_patterns.py), fair-value-gap (FVG) retests
           and support/resistance bounces.
Checks   : higher-timeframe trend, local trend, at support/resistance (swing pivots), level
           strength (>= 2 touches), previous-day high/low, $10 round number, inside a fresh
           same-direction FVG, relative volume >= 1.5x, clear path to target, London/NY session.
Outcome  : entry next open, stop 1 ATR, target 1.5R, $0.30/oz round-trip cost, max 24 bars.
Split    : in-sample (IS) Jun-Dec 2025, out-of-sample (OOS) 2026.

Every check uses only information available at the close of the signal candle
(pivots are used only after their right-hand bars have closed).

Usage (from xauusd-strategy/): python fetch_data.py --interval 5m --start 2025-06-01
                               python research/confluence.py 5m|15m
"""
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from strategy import atr, ema, rsi  # noqa: E402

COST = 0.30
SPLIT = pd.Timestamp("2026-01-01")
STOP_ATR, RR, MAX_BARS = 1.0, 1.5, 24
TOL = 0.3  # "at a level" = within 0.3 ATR

CHECKS = ["htf_trend", "local_trend", "at_sr", "sr_strong", "at_prev_day", "round_number",
          "in_fvg", "high_volume", "clear_path", "session"]


# --------------------------------------------------------------------------- data

def prepare(m5: pd.DataFrame, tf: str) -> pd.DataFrame:
    """Drop the hours spot gold is closed and resample 5m candles to `tf`."""
    wd, hr = m5.index.weekday, m5.index.hour
    m5 = m5[~((wd == 5) | ((wd == 4) & (hr >= 21)) | ((wd == 6) & (hr < 22)))]
    if tf == "5m":
        return m5.copy()
    agg = {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum", "trades": "sum"}
    return m5.resample(tf.replace("m", "min")).agg(agg).dropna()


def load_bars(tf: str = "5m", start: str = "2025-06-01") -> pd.DataFrame:
    m5 = pd.read_csv(ROOT / "data" / "xauusd_5m.csv", parse_dates=["time"]).set_index("time")
    return prepare(m5[m5.index >= start], tf)


# --------------------------------------------------------------------------- signals

def candle_patterns(b: pd.DataFrame, A: pd.Series) -> dict:
    o, h, l, c = b.open, b.high, b.low, b.close
    rng = (h - l).replace(0, np.nan)
    body = (c - o).abs()
    up_w, lo_w = h - np.maximum(o, c), np.minimum(o, c) - l
    bull, bear = c > o, c < o
    P, PP = (lambda s: s.shift(1)), (lambda s: s.shift(2))
    inside_prev = (P(h) < PP(h)) & (P(l) > PP(l))
    lo20, hi20 = l.rolling(20).min().shift(1), h.rolling(20).max().shift(1)
    return {
        "hammer": ((lo_w >= 2 * body) & (lo_w >= 0.6 * rng) & (up_w <= 0.15 * rng) & (rng >= 0.8 * A), 1),
        "shooting_star": ((up_w >= 2 * body) & (up_w >= 0.6 * rng) & (lo_w <= 0.15 * rng) & (rng >= 0.8 * A), -1),
        "bull_marubozu": (bull & (body >= 0.85 * rng) & (rng >= 1.2 * A), 1),
        "bear_marubozu": (bear & (body >= 0.85 * rng) & (rng >= 1.2 * A), -1),
        "bull_engulfing": (bull & P(bear) & (c >= P(o)) & (o <= P(c)) & (body > P(body)), 1),
        "bear_engulfing": (bear & P(bull) & (c <= P(o)) & (o >= P(c)) & (body > P(body)), -1),
        "piercing": (bull & P(bear) & (o < P(c)) & (c > (P(o) + P(c)) / 2) & (c < P(o)), 1),
        "dark_cloud": (bear & P(bull) & (o > P(c)) & (c < (P(o) + P(c)) / 2) & (c > P(o)), -1),
        "tweezer_bottom": (((l - P(l)).abs() <= 0.05 * A) & P(bear) & bull, 1),
        "tweezer_top": (((h - P(h)).abs() <= 0.05 * A) & P(bull) & bear, -1),
        "inside_bar_break_up": (inside_prev & (c > P(h)), 1),
        "inside_bar_break_dn": (inside_prev & (c < P(l)), -1),
        "bull_outside_bar": ((h > P(h)) & (l < P(l)) & bull & (c > P(h)), 1),
        "bear_outside_bar": ((h > P(h)) & (l < P(l)) & bear & (c < P(l)), -1),
        "morning_star": (PP(bear) & (PP(body) >= 0.6 * A) & (P(body) <= 0.3 * P(rng)) & bull & (c > (PP(o) + PP(c)) / 2), 1),
        "evening_star": (PP(bull) & (PP(body) >= 0.6 * A) & (P(body) <= 0.3 * P(rng)) & bear & (c < (PP(o) + PP(c)) / 2), -1),
        "three_soldiers": (bull & P(bull) & PP(bull) & (c > P(c)) & (P(c) > PP(c)) & (body > 0.5 * rng) & (P(body) > 0.5 * P(rng)), 1),
        "three_crows": (bear & P(bear) & PP(bear) & (c < P(c)) & (P(c) < PP(c)) & (body > 0.5 * rng) & (P(body) > 0.5 * P(rng)), -1),
        "sweep_low_reclaim": ((l < lo20) & (c > lo20) & bull, 1),
        "sweep_high_reject": ((h > hi20) & (c < hi20) & bear, -1),
    }


def fair_value_gaps(b: pd.DataFrame, A: pd.Series, min_size: float = 0.25, max_age: int = 48) -> pd.DataFrame:
    """Track unfilled FVGs. Bullish FVG: low[i] > high[i-2]; bearish: high[i] < low[i-2].

    Returns per-bar flags: in_bull / in_bear (bar trades into a live same-direction gap and
    closes without breaking it), first touch flags, confirmed retests, and the gap edge
    (used as a structure stop).
    """
    h, l, c, o, at = b.high.values, b.low.values, b.close.values, b.open.values, A.values
    n = len(b)
    out = {k: np.zeros(n, bool) for k in ["in_bull", "in_bear", "retest_bull", "retest_bear",
                                          "retest_bull_conf", "retest_bear_conf"]}
    edge_bull, edge_bear = np.full(n, np.nan), np.full(n, np.nan)
    bulls, bears = [], []  # [bottom, top, created_bar, touched]
    for i in range(2, n):
        keep = []
        for z in bulls:
            if i - z[2] > max_age:
                continue
            if l[i] <= z[1]:
                if c[i] < z[0]:
                    continue  # gap broken
                out["in_bull"][i] = True
                edge_bull[i] = z[0] if np.isnan(edge_bull[i]) else max(edge_bull[i], z[0])
                if not z[3]:
                    out["retest_bull"][i] = True
                    out["retest_bull_conf"][i] |= (c[i] > z[1]) and (c[i] > o[i])
                    z[3] = True
            keep.append(z)
        bulls = keep[-20:]
        keep = []
        for z in bears:
            if i - z[2] > max_age:
                continue
            if h[i] >= z[0]:
                if c[i] > z[1]:
                    continue
                out["in_bear"][i] = True
                edge_bear[i] = z[1] if np.isnan(edge_bear[i]) else min(edge_bear[i], z[1])
                if not z[3]:
                    out["retest_bear"][i] = True
                    out["retest_bear_conf"][i] |= (c[i] < z[0]) and (c[i] < o[i])
                    z[3] = True
            keep.append(z)
        bears = keep[-20:]
        if np.isfinite(at[i]) and l[i] > h[i - 2] and l[i] - h[i - 2] >= min_size * at[i]:
            bulls.append([h[i - 2], l[i], i, False])
        if np.isfinite(at[i]) and h[i] < l[i - 2] and l[i - 2] - h[i] >= min_size * at[i]:
            bears.append([h[i], l[i - 2], i, False])
    df = pd.DataFrame(out, index=b.index)
    df["edge_bull"], df["edge_bear"] = edge_bull, edge_bear
    return df


def sr_levels(b: pd.DataFrame, A: pd.Series, bars_per_day: int, left: int = 5, right: int = 5) -> pd.DataFrame:
    """Support/resistance from confirmed swing pivots of the last day, plus round numbers and
    the previous trading day's high/low (trading day starts 22:00 UTC)."""
    h, l, c, at = b.high.values, b.low.values, b.close.values, A.values
    w = left + right + 1
    piv_hi = (b.high == b.high.rolling(w, center=True).max()).values
    piv_lo = (b.low == b.low.rolling(w, center=True).min()).values
    n = len(b)
    at_sup, at_res = np.zeros(n, bool), np.zeros(n, bool)
    sup_strength, res_strength = np.zeros(n, int), np.zeros(n, int)
    room_up, room_dn = np.full(n, np.inf), np.full(n, np.inf)
    levels = []  # (available_from_bar, price)
    for i in range(n):
        p = i - right  # pivot at p is confirmed once bar p+right has closed
        if p >= left:
            if piv_hi[p]:
                levels.append((i, h[p]))
            if piv_lo[p]:
                levels.append((i, l[p]))
        levels = [(t, v) for t, v in levels if i - t <= bars_per_day]
        if not np.isfinite(at[i]) or not levels:
            continue
        tol = TOL * at[i]
        lv = np.array([v for _, v in levels])
        # support: a level at/below the close that this bar's low touched (or swept and reclaimed)
        s = lv[(lv <= c[i] + tol) & (l[i] <= lv + tol)]
        if len(s):
            top = s.max()
            at_sup[i] = True
            sup_strength[i] = int((np.abs(lv - top) <= tol).sum())
        r = lv[(lv >= c[i] - tol) & (h[i] >= lv - tol)]
        if len(r):
            bot = r.min()
            at_res[i] = True
            res_strength[i] = int((np.abs(lv - bot) <= tol).sum())
        above, below = lv[lv > c[i] + tol], lv[lv < c[i] - tol]
        room_up[i] = (above.min() - c[i]) / at[i] if len(above) else np.inf
        room_dn[i] = (c[i] - below.max()) / at[i] if len(below) else np.inf

    day = (b.index + pd.Timedelta(hours=2)).normalize()
    daily = b.groupby(day).agg(dh=("high", "max"), dl=("low", "min")).shift(1)
    pdh = daily.dh.reindex(day).values
    pdl = daily.dl.reindex(day).values
    tol = TOL * A.values
    near_pdl = ((np.abs(l - pdl) <= tol) | ((l < pdl) & (c > pdl)))
    near_pdh = ((np.abs(h - pdh) <= tol) | ((h > pdh) & (c < pdh)))
    rl = np.round(l / 10) * 10
    rh = np.round(h / 10) * 10
    round_sup = (np.abs(l - rl) <= tol) & (rl <= c + tol)
    round_res = (np.abs(h - rh) <= tol) & (rh >= c - tol)
    return pd.DataFrame({"at_sup": at_sup, "at_res": at_res, "sup_strength": sup_strength,
                         "res_strength": res_strength, "room_up": room_up, "room_dn": room_dn,
                         "near_pdl": near_pdl, "near_pdh": near_pdh,
                         "round_sup": round_sup, "round_res": round_res}, index=b.index)


def context(b: pd.DataFrame, tf: str) -> tuple[pd.DataFrame, pd.Series]:
    A = atr(b, 14)
    bars_per_hour = int(pd.Timedelta("1h") / pd.Timedelta(tf))
    ctx = pd.DataFrame(index=b.index)
    ctx["ema50"] = ema(b.close, 50)
    ctx["htf"] = ema(b.close, 50 * bars_per_hour)  # ~EMA50 of the 1H chart
    ctx["rsi"] = rsi(b.close, 14)
    mins = b.index.hour * 60 + b.index.minute
    ctx["good_session"] = (mins >= 420) & (mins < 990)  # London + NY overlap, 07:00-16:30 UTC
    # relative volume vs the same time of day over the previous 20 sessions
    tod = b.index.hour * 60 + b.index.minute
    for col in ["volume", "trades"]:
        med = b[col].groupby(tod).transform(lambda s: s.shift(1).rolling(20, min_periods=10).median())
        ctx[f"rel_{col}"] = b[col] / med
    ctx = ctx.join(sr_levels(b, A, bars_per_day=24 * bars_per_hour))
    ctx = ctx.join(fair_value_gaps(b, A))
    return ctx, A


# --------------------------------------------------------------------------- evaluation

def simulate(b, A, idx, sides, stop_dist=None):
    O, H, L, C, AT = b.open.values, b.high.values, b.low.values, b.close.values, A.values
    res = np.full(len(idx), np.nan)
    for k, (i, s) in enumerate(zip(idx, sides)):
        if i + 1 >= len(b) or not np.isfinite(AT[i]):
            continue
        e = O[i + 1]
        risk = STOP_ATR * AT[i] if stop_dist is None else stop_dist[k]
        if not np.isfinite(risk) or risk <= 0:
            continue
        st, tp = e - s * risk, e + s * RR * risk
        r = None
        for j in range(i + 1, min(i + 1 + MAX_BARS, len(b))):
            if (s == 1 and L[j] <= st) or (s == -1 and H[j] >= st):
                gap = (s == 1 and O[j] < st) or (s == -1 and O[j] > st)
                r = (O[j] - e) * s if gap else -risk
                break
            if (s == 1 and H[j] >= tp) or (s == -1 and L[j] <= tp):
                r = RR * risk
                break
        if r is None:
            r = (C[min(i + MAX_BARS, len(b) - 1)] - e) * s
        res[k] = (r - COST) / risk
    return res


def build_signals(b: pd.DataFrame, tf: str) -> pd.DataFrame:
    ctx, A = context(b, tf)
    c = b.close
    setups = candle_patterns(b, A)
    setups["fvg_retest_bull"] = (pd.Series(ctx.retest_bull, index=b.index), 1)
    setups["fvg_retest_bear"] = (pd.Series(ctx.retest_bear, index=b.index), -1)
    setups["fvg_retest_bull_conf"] = (pd.Series(ctx.retest_bull_conf, index=b.index), 1)
    setups["fvg_retest_bear_conf"] = (pd.Series(ctx.retest_bear_conf, index=b.index), -1)
    setups["sr_bounce_bull"] = (ctx.at_sup & (c > b.open) & (ctx.sup_strength >= 2), 1)
    setups["sr_bounce_bear"] = (ctx.at_res & (c < b.open) & (ctx.res_strength >= 2), -1)
    frames = []
    for name, (cond, side) in setups.items():
        idx = np.where(cond.fillna(False).values)[0]
        idx = idx[idx > 24 * 12 * 2]  # skip warm-up
        if not len(idx):
            continue
        x = ctx.iloc[idx]
        long = side == 1
        f = pd.DataFrame(index=x.index)
        f["setup"], f["side"] = name, side
        f["htf_trend"] = (c.iloc[idx] > x.htf).values == long
        f["local_trend"] = (c.iloc[idx] > x.ema50).values == long
        f["at_sr"] = (x.at_sup if long else x.at_res).values
        f["sr_strong"] = ((x.sup_strength if long else x.res_strength) >= 2).values
        f["at_prev_day"] = (x.near_pdl if long else x.near_pdh).values
        f["round_number"] = (x.round_sup if long else x.round_res).values
        f["in_fvg"] = (x.in_bull if long else x.in_bear).values
        f["high_volume"] = (x.rel_trades >= 1.5).values
        f["clear_path"] = ((x.room_up if long else x.room_dn) >= RR * STOP_ATR).values
        f["session"] = x.good_session.values
        f["r"] = simulate(b, A, idx, np.full(len(idx), side))
        if name.startswith("fvg_retest"):
            edge = (x.edge_bull if long else x.edge_bear).values
            entry = b.open.shift(-1).iloc[idx].values
            dist = np.maximum((entry - edge) * side + 0.1 * A.iloc[idx].values, 0.5 * A.iloc[idx].values)
            f["r_structure_stop"] = simulate(b, A, idx, np.full(len(idx), side), dist)
        frames.append(f)
    return pd.concat(frames).dropna(subset=["r"]).sort_index()


def summary(d: pd.DataFrame, col: str = "r") -> str:
    d = d.dropna(subset=[col])
    if len(d) == 0:
        return "n=0"
    return f"n={len(d):5d} win={100 * (d[col] > 0).mean():5.1f}% exp={d[col].mean():+.3f}R"


def main() -> None:
    tf = sys.argv[1] if len(sys.argv) > 1 else "5m"
    b = load_bars(tf)
    s = build_signals(b, tf)
    IS, OOS = s[s.index < SPLIT], s[s.index >= SPLIT]
    print(f"[{tf}] stop {STOP_ATR} ATR, target 1:{RR}, cost ${COST}, {len(b)} bars, {len(s)} signals\n")

    print("SETUPS (IS | OOS)")
    for name, _ in s.groupby("setup"):
        print(f"  {name:22} {summary(IS[IS.setup == name])} | {summary(OOS[OOS.setup == name])}")
    for name in ["fvg_retest_bull", "fvg_retest_bear", "fvg_retest_bull_conf", "fvg_retest_bear_conf"]:
        print(f"  {name + ' [zone stop]':34} {summary(IS[IS.setup == name], 'r_structure_stop')} | "
              f"{summary(OOS[OOS.setup == name], 'r_structure_stop')}")

    print("\nCHECKS across all signals: with check | without check   (IS ... || OOS ...)")
    for k in CHECKS:
        print(f"  {k:13} IS {summary(IS[IS[k]])} vs {summary(IS[~IS[k]])} || "
              f"OOS {summary(OOS[OOS[k]])} vs {summary(OOS[~OOS[k]])}")

    s["score"] = s[CHECKS].sum(axis=1)
    IS, OOS = s[s.index < SPLIT], s[s.index >= SPLIT]
    print("\nCONFLUENCE SCORE (number of checks passed, 0-10)")
    for sc in range(0, 11):
        a, o = IS[IS.score == sc], OOS[OOS.score == sc]
        if len(a) + len(o):
            print(f"  {sc:2d}/10  IS {summary(a)} | OOS {summary(o)}")
    for lo in [6, 7, 8]:
        print(f"  >={lo}    IS {summary(IS[IS.score >= lo])} | OOS {summary(OOS[OOS.score >= lo])}")


if __name__ == "__main__":
    main()
