"""Download hourly PAXG/USDT candles (tokenised gold, 1 PAXG = 1 troy oz) as an XAU/USD proxy.

Usage: python fetch_data.py [--out data/xauusd_1h.csv] [--start 2020-01-01]

You can replace the output with your broker's XAUUSD export (MT4/MT5 etc.) as long as
it has the columns: time,open,high,low,close (time in UTC).
"""
import argparse
import csv
import json
import time
import urllib.request
from datetime import datetime, timezone

URL = "https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT&interval=1h&limit=1000&startTime={}"


def fetch(start_ms: int) -> list:
    for attempt in range(5):
        try:
            with urllib.request.urlopen(URL.format(start_ms), timeout=30) as r:
                return json.load(r)
        except Exception:
            time.sleep(2 ** attempt)
    raise RuntimeError("download failed")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="data/xauusd_1h.csv")
    p.add_argument("--start", default="2020-01-01")
    a = p.parse_args()
    start = int(datetime.fromisoformat(a.start).replace(tzinfo=timezone.utc).timestamp() * 1000)
    rows = []
    while True:
        batch = fetch(start)
        if not batch:
            break
        rows += [(k[0] // 1000, k[1], k[2], k[3], k[4]) for k in batch]
        start = batch[-1][0] + 3_600_000
        if len(batch) < 1000:
            break
    with open(a.out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["time", "open", "high", "low", "close"])
        for t, o, h, l, c in rows:
            w.writerow([datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d %H:%M"), o, h, l, c])
    print(f"wrote {len(rows)} bars to {a.out}")


if __name__ == "__main__":
    main()
