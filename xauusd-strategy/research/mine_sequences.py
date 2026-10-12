"""Data-mined candle sequences: encode each candle as 18 shape states (direction x body size x
close location), test every 2- and 3-candle sequence seen >=100 times in both periods, and
check whether in-sample winners (|t| > 3) keep their direction out of sample.

Usage (from xauusd-strategy/): python research/mine_sequences.py
"""
import sys, warnings, numpy as np, pandas as pd
warnings.filterwarnings("ignore")
sys.path.insert(0, ".")
from strategy import atr
SPLIT = pd.Timestamp("2026-01-01")
m5 = pd.read_csv("data/xauusd_5m.csv", parse_dates=["time"]).set_index("time")
m5 = m5[m5.index >= "2025-06-01"]
wd, hr = m5.index.weekday, m5.index.hour
m5 = m5[~((wd == 5) | ((wd == 4) & (hr >= 21)) | ((wd == 6) & (hr < 22)))]
for TF in ["5m", "15m"]:
    b = m5 if TF == "5m" else m5.resample("15min").agg({"open":"first","high":"max","low":"min","close":"last"}).dropna()
    o,h,l,c = b.open,b.high,b.low,b.close; A = atr(b,14); rng=(h-l).replace(0,np.nan)
    d = np.sign(c-o).astype(int)                                  # -1/0/1
    big = ((c-o).abs() > 0.5*A).astype(int)                       # body size
    loc = np.clip(((c-l)/rng*3).fillna(1).astype(int), 0, 2)      # close in lower/mid/upper third
    code = ((d+1)*6 + big*3 + loc).astype(int)                    # 18 single-candle states
    for k in [2, 3]:
        seq = code.copy()
        for j in range(1, k): seq = seq + code.shift(j).fillna(0).astype(int) * 18**j
        fwd = (c.shift(-4) - b.open.shift(-1)) / A                 # next-4-bar move in ATR from next open
        df = pd.DataFrame({"seq": seq, "fwd": fwd, "is": b.index < SPLIT}).dropna()
        g = df.groupby(["seq", "is"]).fwd.agg(["mean","count","std"]).unstack("is")
        g = g[(g[("count", True)] >= 100) & (g[("count", False)] >= 100)]
        mi, mo = g[("mean", True)], g[("mean", False)]
        t_is = mi / (g[("std", True)] / np.sqrt(g[("count", True)]))
        sig = t_is.abs() > 3   # strong in-sample
        same = np.sign(mi[sig]) == np.sign(mo[sig])
        print(f"[{TF}] {k}-candle sequences tested: {len(g)} | IS-vs-OOS correlation of mean move: {np.corrcoef(mi, mo)[0,1]:+.2f} "
              f"| strong in-sample (|t|>3): {sig.sum()} | same direction OOS: {same.sum()} "
              f"| avg |OOS move| of those: {mo[sig].abs().mean():.3f} ATR (cost ≈ {0.30/A.median():.3f} ATR)")
