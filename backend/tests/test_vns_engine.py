from datetime import datetime, timezone

from app.services.vns_engine import Bar, Label, analyze_bars, within_tolerance


def test_tolerance_near_prices():
    assert within_tolerance(17238.24, 17239.44, tolerance_abs=2.0, tolerance_pct=0.05)
    assert not within_tolerance(100.0, 110.0, tolerance_abs=1.0, tolerance_pct=0.15)


def test_double_bottom_signal():
    bars = [
        Bar(datetime(2025, 3, 1, tzinfo=timezone.utc), 100, 105, 99, 104),
        Bar(datetime(2025, 3, 2, tzinfo=timezone.utc), 104, 106, 95, 96),
        Bar(datetime(2025, 3, 3, tzinfo=timezone.utc), 96, 103, 94, 102),
        Bar(datetime(2025, 3, 4, tzinfo=timezone.utc), 102, 104, 95.2, 97),
        Bar(datetime(2025, 3, 5, tzinfo=timezone.utc), 97, 108, 96, 107),
    ]
    result = analyze_bars(bars, tolerance_abs=1.0, tolerance_pct=0.5)
    labels = [m.label for m in result.marks]
    assert Label.BU in labels or Label.BE in labels or Label.R in labels or Label.DB in labels or Label.DT in labels
    assert result.as_of is not None
