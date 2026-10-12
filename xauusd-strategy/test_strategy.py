"""Sanity tests: python -m unittest test_strategy.py"""
import unittest

import numpy as np
import pandas as pd

from strategy import Params, add_indicators, backtest, resample, rsi


def synthetic(n_hours=24 * 400, seed=1):
    rng = np.random.default_rng(seed)
    close = 1800 + np.cumsum(rng.normal(0.05, 3, n_hours))
    idx = pd.date_range("2022-01-01", periods=n_hours, freq="1h")
    open_ = np.r_[close[0], close[:-1]]
    spread = np.abs(rng.normal(0, 2, n_hours))
    return pd.DataFrame({"open": open_, "high": np.maximum(open_, close) + spread,
                         "low": np.minimum(open_, close) - spread, "close": close}, index=idx)


class StrategyTests(unittest.TestCase):
    def test_rsi_bounds(self):
        r = rsi(synthetic().close, 2).dropna()
        self.assertTrue(((r >= 0) & (r <= 100)).all())

    def test_no_lookahead(self):
        """Signals up to bar k must not change when future bars are removed."""
        df = synthetic()
        p = Params()
        full = add_indicators(resample(df, p.timeframe), p).signal
        cut = add_indicators(resample(df.iloc[: len(df) // 2], p.timeframe), p).signal
        common = cut.index[:-1]  # last 4H bar of the cut may be incomplete
        pd.testing.assert_series_equal(full.loc[common], cut.loc[common])

    def test_trades_are_consistent(self):
        t = backtest(synthetic(), Params())
        self.assertGreater(len(t), 0)
        self.assertTrue((pd.to_datetime(t.exit_time) > pd.to_datetime(t.entry_time)).all())
        # no overlapping positions
        self.assertTrue((pd.to_datetime(t.entry_time).iloc[1:].values >
                         pd.to_datetime(t.exit_time).iloc[:-1].values).all())
        # a stopped-out trade never loses much more than 1R (only gaps + costs)
        self.assertGreater(t.r.min(), -1.5)


if __name__ == "__main__":
    unittest.main()
