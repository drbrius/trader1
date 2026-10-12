"""No-look-ahead tests for the confluence checks and FVG signals: python -m unittest test_signals.py"""
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent / "research"))
import confluence as cf  # noqa: E402
from fvg_signals import scan  # noqa: E402


def synthetic_m5(days=40, seed=3):
    n = days * 288
    rng = np.random.default_rng(seed)
    # trending random walk with volatility bursts so FVGs actually form
    vol = 0.6 + 2.5 * (rng.random(n) < 0.03)
    close = 3300 + np.cumsum(rng.normal(0.02, 1, n) * vol)
    idx = pd.date_range("2025-07-01", periods=n, freq="5min")
    open_ = np.r_[close[0], close[:-1]]
    wick = np.abs(rng.normal(0, 0.6, n))
    return pd.DataFrame({"open": open_, "high": np.maximum(open_, close) + wick,
                         "low": np.minimum(open_, close) - wick, "close": close,
                         "volume": rng.gamma(2, 3, n), "trades": rng.poisson(80, n).astype(float)}, index=idx)


class NoLookAhead(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.b = cf.prepare(synthetic_m5(), "15m")
        cls.cut = cls.b.iloc[: len(cls.b) * 2 // 3]

    def test_context_uses_only_past_bars(self):
        full, _ = cf.context(self.b, "15m")
        part, _ = cf.context(self.cut, "15m")
        cols = ["ema50", "htf", "rel_trades", "at_sup", "at_res", "sup_strength", "room_up", "near_pdl",
                "near_pdh", "round_sup", "in_bull", "retest_bull", "retest_bull_conf", "edge_bull"]
        pd.testing.assert_frame_equal(full.loc[part.index, cols], part[cols])

    def test_signals_unchanged_by_future_data(self):
        full = scan(self.b)
        part = scan(self.cut)
        self.assertGreater(len(part), 5, "synthetic data should produce some FVG retests")
        pd.testing.assert_frame_equal(full.loc[full.index <= self.cut.index[-1]], part)

    def test_stop_below_entry_and_rating_range(self):
        s = scan(self.b)
        self.assertTrue((s.stop < s.entry).all())
        self.assertTrue((s.target > s.entry).all())
        self.assertTrue(s.rating.isin([2, 4, 6, 8, 10]).all())


if __name__ == "__main__":
    unittest.main()
