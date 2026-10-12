"""Download PAXG/USDT candles (tokenised gold, 1 PAXG = 1 troy oz) as an XAU/USD proxy.

Usage: python fetch_data.py [--interval 1h|15m|5m|...] [--out data/xauusd_<interval>.csv] [--start 2020-01-01]

Completed months come from Binance's monthly bulk archives (fast); the current month
comes from the klines API.

You can replace the output with your broker's XAUUSD export (MT4/MT5 etc.) as long as
it has the columns: time,open,high,low,close (time in UTC). Output also carries volume
(PAXG ounces traded) and trades (number of trades); strategy.py ignores both.
"""
import argparse
import csv
import io
import json
import time
import urllib.error
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

URL = "https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT&interval={}&limit=1000&startTime={}"
BULK = "https://data.binance.vision/data/spot/monthly/klines/PAXGUSDT/{0}/PAXGUSDT-{0}-{1}.zip"
STEP_MS = {"1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000}


def _get(url: str) -> bytes | None:
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
        except Exception:
            pass
        time.sleep(2 ** attempt)
    raise RuntimeError(f"download failed: {url}")


def _seconds(ts: int) -> int:
    # bulk files switched from milliseconds to microseconds in 2025
    return ts // 1_000_000 if ts > 10**14 else ts // 1000


def fetch_month(interval: str, month: str) -> list:
    raw = _get(BULK.format(interval, month))
    if raw is None:
        return []
    z = zipfile.ZipFile(io.BytesIO(raw))
    rows = csv.reader(io.TextIOWrapper(z.open(z.namelist()[0])))
    return [(_seconds(int(k[0])), k[1], k[2], k[3], k[4], k[5], k[8]) for k in rows if k and k[0].isdigit()]


def fetch_api(interval: str, start_ms: int) -> list:
    rows = []
    while True:
        batch = json.loads(_get(URL.format(interval, start_ms)))
        if not batch:
            break
        rows += [(k[0] // 1000, k[1], k[2], k[3], k[4], k[5], k[8]) for k in batch]
        start_ms = batch[-1][0] + STEP_MS[interval]
        if len(batch) < 1000:
            break
    return rows


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--interval", default="1h", choices=sorted(STEP_MS))
    p.add_argument("--out", help="default: data/xauusd_<interval>.csv")
    p.add_argument("--start", default="2020-01-01")
    a = p.parse_args()
    a.out = a.out or f"data/xauusd_{a.interval}.csv"

    start = datetime.fromisoformat(a.start).replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    months, y, m = [], start.year, start.month
    while (y, m) < (now.year, now.month):
        months.append(f"{y}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    with ThreadPoolExecutor(8) as ex:
        rows = [r for chunk in ex.map(lambda mo: fetch_month(a.interval, mo), months) for r in chunk]
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    api_from = max(month_start, start) if rows else start
    rows += fetch_api(a.interval, int(api_from.timestamp() * 1000))

    first = int(start.timestamp())
    seen, out = set(), []
    for r in sorted(rows):
        if r[0] >= first and r[0] not in seen:
            seen.add(r[0])
            out.append(r)
    with open(a.out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["time", "open", "high", "low", "close", "volume", "trades"])
        for t, o, h, l, c, v, n in out:
            w.writerow([datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%d %H:%M"), o, h, l, c, v, n])
    print(f"wrote {len(out)} bars to {a.out}")


if __name__ == "__main__":
    main()
