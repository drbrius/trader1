"""Candle-pattern study on 5m/15m gold (PAXG, Jun 2025 -> Oct 2026, weekend hours removed).

Tests 20 classic patterns plus context (trend, higher-timeframe trend, 20-bar extreme, RSI,
session). Each signal: entry next open, stop 1 ATR, target 1.5R, $0.30/oz cost.
In-sample = before 2026-01-01, out-of-sample = 2026.

Usage (from xauusd-strategy/): python fetch_data.py --interval 5m --start 2025-06-01
                               python research/candle_patterns.py 5m|15m
"""
import sys, warnings
import numpy as np, pandas as pd
warnings.filterwarnings("ignore")
sys.path.insert(0, ".")
from strategy import ema, rsi, atr

TF = sys.argv[1] if len(sys.argv) > 1 else "5m"
COST = 0.30
SPLIT = pd.Timestamp("2026-01-01")

m5 = pd.read_csv("data/xauusd_5m.csv", parse_dates=["time"]).set_index("time")
m5 = m5[m5.index >= "2025-06-01"]
wd, hr = m5.index.weekday, m5.index.hour
m5 = m5[~((wd == 5) | ((wd == 4) & (hr >= 21)) | ((wd == 6) & (hr < 22)))]
b = m5 if TF == "5m" else m5.resample(TF.replace("m", "min")).agg({"open": "first", "high": "max", "low": "min", "close": "last"}).dropna()
o, h, l, c = b.open, b.high, b.low, b.close
A = atr(b, 14)
rng = (h - l).replace(0, np.nan)
body = (c - o).abs()
up_w = h - np.maximum(o, c)
lo_w = np.minimum(o, c) - l
bull, bear = c > o, c < o
P = lambda s: s.shift(1)
PP = lambda s: s.shift(2)

pat = {}
# single candle
pat["hammer"] = ((lo_w >= 2 * body) & (lo_w >= 0.6 * rng) & (up_w <= 0.15 * rng) & (rng >= 0.8 * A), 1)
pat["shooting_star"] = ((up_w >= 2 * body) & (up_w >= 0.6 * rng) & (lo_w <= 0.15 * rng) & (rng >= 0.8 * A), -1)
pat["bull_marubozu"] = (bull & (body >= 0.85 * rng) & (rng >= 1.2 * A), 1)
pat["bear_marubozu"] = (bear & (body >= 0.85 * rng) & (rng >= 1.2 * A), -1)
# two candle
pat["bull_engulfing"] = (bull & P(bear) & (c >= P(o)) & (o <= P(c)) & (body > P(body)), 1)
pat["bear_engulfing"] = (bear & P(bull) & (c <= P(o)) & (o >= P(c)) & (body > P(body)), -1)
pat["piercing"] = (bull & P(bear) & (o < P(c)) & (c > (P(o) + P(c)) / 2) & (c < P(o)), 1)
pat["dark_cloud"] = (bear & P(bull) & (o > P(c)) & (c < (P(o) + P(c)) / 2) & (c > P(o)), -1)
pat["tweezer_bottom"] = (((l - P(l)).abs() <= 0.05 * A) & P(bear) & bull, 1)
pat["tweezer_top"] = (((h - P(h)).abs() <= 0.05 * A) & P(bull) & bear, -1)
inside_prev = (P(h) < PP(h)) & (P(l) > PP(l))
pat["inside_bar_break_up"] = (inside_prev & (c > P(h)), 1)
pat["inside_bar_break_dn"] = (inside_prev & (c < P(l)), -1)
pat["bull_outside_bar"] = ((h > P(h)) & (l < P(l)) & bull & (c > P(h)), 1)
pat["bear_outside_bar"] = ((h > P(h)) & (l < P(l)) & bear & (c < P(l)), -1)
# three candle
pat["morning_star"] = (PP(bear) & (PP(body) >= 0.6 * A) & (P(body) <= 0.3 * P(rng)) & bull & (c > (PP(o) + PP(c)) / 2), 1)
pat["evening_star"] = (PP(bull) & (PP(body) >= 0.6 * A) & (P(body) <= 0.3 * P(rng)) & bear & (c < (PP(o) + PP(c)) / 2), -1)
pat["three_soldiers"] = (bull & P(bull) & PP(bull) & (c > P(c)) & (P(c) > PP(c)) & (body > 0.5 * rng) & (P(body) > 0.5 * P(rng)), 1)
pat["three_crows"] = (bear & P(bear) & PP(bear) & (c < P(c)) & (P(c) < PP(c)) & (body > 0.5 * rng) & (P(body) > 0.5 * P(rng)), -1)
# swing failure: wick takes out the 20-bar low/high then closes back inside
lo20, hi20 = l.rolling(20).min().shift(1), h.rolling(20).max().shift(1)
pat["sweep_low_reclaim"] = ((l < lo20) & (c > lo20) & bull, 1)
pat["sweep_high_reject"] = ((h > hi20) & (c < hi20) & bear, -1)

# context
per_h = int(pd.Timedelta("1h") / pd.Timedelta(TF))
ctx = pd.DataFrame(index=b.index)
ctx["e50"] = ema(c, 50); ctx["htf"] = ema(c, 50 * per_h * (1 if TF == "15m" else 3))  # 1H EMA50 (15m) / 15m->... ~3H on 5m
ctx["rsi"] = rsi(c, 14)
mins = b.index.hour * 60 + b.index.minute
ctx["session"] = np.select([(mins >= 420) & (mins < 720), (mins >= 720) & (mins < 990), (mins >= 990) & (mins < 1260)], ["london", "ny_overlap", "ny_late"], "asia")
ctx["near_low"] = (c - l.rolling(20).min()) <= 0.75 * A
ctx["near_high"] = (h.rolling(20).max() - c) <= 0.75 * A


def outcomes(sig_idx, sides, stop_atr, rr, max_bars=24):
    O, H, L, C, AT = o.values, h.values, l.values, c.values, A.values
    res = np.full(len(sig_idx), np.nan)
    for k, (i, s) in enumerate(zip(sig_idx, sides)):
        if i + 1 >= len(b) or not np.isfinite(AT[i]): continue
        e = O[i + 1]; risk = stop_atr * AT[i]; st = e - s * risk; tp = e + s * rr * risk
        r = None
        for j in range(i + 1, min(i + 1 + max_bars, len(b))):
            if (s == 1 and L[j] <= st) or (s == -1 and H[j] >= st): r = -risk if (s == 1 and O[j] >= st) or (s == -1 and O[j] <= st) else (O[j] - e) * s; break
            if (s == 1 and H[j] >= tp) or (s == -1 and L[j] <= tp): r = rr * risk; break
        if r is None:
            j = min(i + max_bars, len(b) - 1); r = (C[j] - e) * s
        res[k] = (r - COST) / risk
    return res


rows = []
recs = []
for name, (cond, side) in pat.items():
    idx = np.where(cond.fillna(False).values)[0]
    idx = idx[idx > 300]
    sides = np.full(len(idx), side)
    r = outcomes(idx, sides, 1.0, 1.5)
    t = b.index[idx]
    df = pd.DataFrame({"t": t, "r": r, "pattern": name, "side": side,
                       "with_trend": ((c.values[idx] > ctx.e50.values[idx]) == (side == 1)),
                       "with_htf": ((c.values[idx] > ctx.htf.values[idx]) == (side == 1)),
                       "location": np.where(side == 1, ctx.near_low.values[idx], ctx.near_high.values[idx]),
                       "rsi_ext": np.where(side == 1, ctx.rsi.values[idx] < 35, ctx.rsi.values[idx] > 65),
                       "session": ctx.session.values[idx]}).dropna(subset=["r"])
    recs.append(df)
allr = pd.concat(recs)


def s(d):
    return pd.Series({"n": len(d), "win%": round((d.r > 0).mean() * 100, 1), "expR": round(d.r.mean(), 3)})


# random baseline: same number of random entries, random side
rs = np.random.default_rng(0)
ri = rs.integers(300, len(b) - 30, 20000); rside = rs.choice([1, -1], 20000)
base = pd.DataFrame({"t": b.index[ri], "r": outcomes(ri, rside, 1.0, 1.5)}).dropna()
print(f"[{TF}] stop 1 ATR, target 1.5R, cost ${COST}. median ATR ${A.median():.2f}")
print("RANDOM baseline  IS", s(base[base.t < SPLIT]).to_dict(), " OOS", s(base[base.t >= SPLIT]).to_dict())
tab = allr.groupby("pattern").apply(lambda d: pd.concat([s(d[d.t < SPLIT]).add_prefix("IS_"), s(d[d.t >= SPLIT]).add_prefix("OOS_")]))
print(tab.sort_values("IS_expR", ascending=False).to_string())
print("\nContext effects across ALL pattern signals (IS | OOS):")
for f in ["with_trend", "with_htf", "location", "rsi_ext", "session"]:
    g = allr.groupby(f).apply(lambda d: pd.concat([s(d[d.t < SPLIT]).add_prefix("IS_"), s(d[d.t >= SPLIT]).add_prefix("OOS_")]))
    print(f"-- {f}"); print(g.to_string())
