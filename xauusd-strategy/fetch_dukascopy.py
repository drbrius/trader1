"""Download real spot XAU/USD 1-minute candles from Dukascopy and build 5m / 15m / 1h CSVs.

Usage: python fetch_dukascopy.py [--start 2021-01-01] [--end today] [--side BID|ASK]

Writes data/xauusd_dk_5m.csv, data/xauusd_dk_15m.csv and data/xauusd_dk_1h.csv
(time,open,high,low,close,volume,trades in UTC; volume = Dukascopy tick volume). Raw day files are cached in data/dukascopy/ so re-runs
only download new days.
"""
import argparse
import lzma
import os
import struct
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone

import pandas as pd

URL = "https://datafeed.dukascopy.com/datafeed/XAUUSD/{y}/{m:02d}/{d:02d}/{side}_candles_min_1.bi5"
POINT = 1000.0  # XAU/USD prices are stored in thousandths of a dollar


def day_file(day: date, side: str, cache: str) -> str | None:
    path = os.path.join(cache, f"{side}_{day.isoformat()}.bi5")
    if os.path.exists(path):
        return path
    url = URL.format(y=day.year, m=day.month - 1, d=day.day, side=side)  # month is 0-based
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            with open(path, "wb") as f:
                f.write(data)
            return path
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
        except Exception:
            pass
        time.sleep(2 ** attempt)
    print(f"  could not download {day} (re-run to retry)")
    return None


def parse(path: str, day: date) -> list:
    raw = open(path, "rb").read()
    if not raw:
        return []
    raw = lzma.decompress(raw)
    base = int(datetime(day.year, day.month, day.day, tzinfo=timezone.utc).timestamp())
    rows = []
    for off in range(0, len(raw), 24):
        t, o, c, lo, hi, vol = struct.unpack(">iiiiif", raw[off:off + 24])
        if vol > 0:  # zero-volume minutes are filler while the market is closed
            rows.append((base + t, o / POINT, hi / POINT, lo / POINT, c / POINT, vol))
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2021-01-01")
    ap.add_argument("--end", default=date.today().isoformat())
    ap.add_argument("--side", default="BID", choices=["BID", "ASK"])
    ap.add_argument("--outdir", default="data")
    ap.add_argument("--threads", type=int, default=3, help="Dukascopy throttles hard; keep this low")
    a = ap.parse_args()
    cache = os.path.join(a.outdir, "dukascopy")
    os.makedirs(cache, exist_ok=True)

    d0, d1 = date.fromisoformat(a.start), date.fromisoformat(a.end)
    days = [d0 + timedelta(i) for i in range((d1 - d0).days + 1)]
    days = [d for d in days if d.weekday() != 5]  # spot gold never trades on Saturday
    with ThreadPoolExecutor(a.threads) as ex:
        paths = list(ex.map(lambda d: day_file(d, a.side, cache), days))
    rows = [r for d, p in zip(days, paths) if p for r in parse(p, d)]
    m1 = pd.DataFrame(rows, columns=["time", "open", "high", "low", "close", "volume"])
    m1["time"] = pd.to_datetime(m1.time, unit="s")
    m1 = m1.set_index("time").sort_index()
    print(f"{len(m1)} one-minute candles {m1.index[0]} -> {m1.index[-1]}")

    suffix = "" if a.side == "BID" else "_ask"
    agg = {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    for tf in ["5min", "15min", "1h"]:
        out = m1.resample(tf).agg(agg).dropna().round(3)
        out["trades"] = out.volume  # Dukascopy tick volume stands in for trade count
        name = tf.replace("min", "m")
        path = os.path.join(a.outdir, f"xauusd_dk_{name}{suffix}.csv")
        out.to_csv(path, index_label="time", date_format="%Y-%m-%d %H:%M")
        print(f"wrote {len(out)} bars to {path}")


if __name__ == "__main__":
    main()
