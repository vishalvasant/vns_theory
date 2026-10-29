"""VNS Theory rule engine — see RULEBOOK.md."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Optional


class Label(str, Enum):
    BU = "BU"
    BE = "BE"
    R = "R"
    DT = "DT"
    DB = "DB"


class Signal(str, Enum):
    BREAKOUT_LONG = "breakout_long"
    BREAKDOWN_SHORT = "breakdown_short"
    DT_SHORT = "dt_short"
    DB_LONG = "db_long"
    SIDEWAYS = "sideways"
    NONE = "none"


@dataclass
class Bar:
    ts: datetime
    open: float
    high: float
    low: float
    close: float


@dataclass
class Mark:
    mark_date: date
    column_side: str  # "BU" or "BE"
    price: float
    label: Label
    note: str = ""


@dataclass
class AnalysisResult:
    marks: list[Mark] = field(default_factory=list)
    trend: str = "unknown"
    last_bu: Optional[float] = None
    last_be: Optional[float] = None
    last_r: Optional[float] = None
    last_dt: Optional[float] = None
    last_db: Optional[float] = None
    signal: Signal = Signal.NONE
    signal_note: str = ""
    stop_hint: Optional[float] = None
    as_of: Optional[datetime] = None


def within_tolerance(
    p1: float,
    p2: float,
    *,
    tick_size: float = 0.05,
    tolerance_abs: float = 1.0,
    tolerance_pct: float = 0.15,
    mode: str = "either",
) -> bool:
    """DT/DB equality is never exact float match — use abs and/or pct bands."""
    if p1 <= 0:
        return abs(p2 - p1) <= tolerance_abs
    abs_diff = abs(p2 - p1)
    pct_diff = abs_diff / p1 * 100.0
    abs_limit = max(tolerance_abs, tick_size * 2)
    abs_ok = abs_diff <= abs_limit
    pct_ok = pct_diff <= tolerance_pct
    if mode == "abs":
        return abs_ok
    if mode == "pct":
        return pct_ok
    return abs_ok or pct_ok


def _near_any(
    price: float,
    refs: list[Optional[float]],
    *,
    tick_size: float,
    tolerance_abs: float,
    tolerance_pct: float,
) -> bool:
    return any(
        ref is not None
        and within_tolerance(
            ref,
            price,
            tick_size=tick_size,
            tolerance_abs=tolerance_abs,
            tolerance_pct=tolerance_pct,
        )
        for ref in refs
    )


def _bar_date(bar: Bar) -> date:
    return bar.ts.date() if isinstance(bar.ts, datetime) else bar.ts


def _swing_extremes(
    bars: list[Bar],
    *,
    side: str,
    lookback: int = 20,
) -> list[tuple[date, float]]:
    """Local swing highs/lows in the recent window (inclusive of window edge)."""
    if len(bars) < 3:
        return []
    window = bars[-lookback:] if len(bars) >= lookback else bars
    out: list[tuple[date, float]] = []
    for i in range(1, len(window) - 1):
        prev_b, cur, nxt = window[i - 1], window[i], window[i + 1]
        if side == "low":
            if cur.low <= prev_b.low and cur.low <= nxt.low:
                out.append((_bar_date(cur), cur.low))
        else:
            if cur.high >= prev_b.high and cur.high >= nxt.high:
                out.append((_bar_date(cur), cur.high))
    # Always consider the absolute extreme in-window as a candidate anchor
    if side == "low":
        m = min(window, key=lambda b: b.low)
        out.append((_bar_date(m), m.low))
    else:
        m = max(window, key=lambda b: b.high)
        out.append((_bar_date(m), m.high))
    # Dedup by date keeping the extreme
    by_day: dict[date, float] = {}
    for d, px in out:
        if d not in by_day:
            by_day[d] = px
        elif side == "low":
            by_day[d] = min(by_day[d], px)
        else:
            by_day[d] = max(by_day[d], px)
    return sorted(by_day.items(), key=lambda x: x[0])


def _atak_from_swings(
    swings: list[tuple[date, float]],
    *,
    tick_size: float,
    tolerance_abs: float,
    tolerance_pct: float,
) -> Optional[tuple[float, date]]:
    """
    If the 2+ most recent swings sit in the same area → Atak pocket.
    Returns (price, date) of the latest swing in that pocket.
    """
    if len(swings) < 2:
        return None
    # Walk back from the newest swing; require at least one earlier match
    latest_date, latest_px = swings[-1]
    matches = [(latest_date, latest_px)]
    for d, px in reversed(swings[:-1]):
        if within_tolerance(
            latest_px,
            px,
            tick_size=tick_size,
            tolerance_abs=tolerance_abs,
            tolerance_pct=tolerance_pct,
        ):
            matches.append((d, px))
        if len(matches) >= 3:
            break
    if len(matches) < 2:
        # Also allow newest vs previous swing even if an older outlier sits between
        prev_date, prev_px = swings[-2]
        if within_tolerance(
            latest_px,
            prev_px,
            tick_size=tick_size,
            tolerance_abs=tolerance_abs,
            tolerance_pct=tolerance_pct,
        ):
            return latest_px, latest_date
        return None
    return latest_px, latest_date


def _classify_high(
    price: float,
    *,
    last_bu: Optional[float],
    last_swing_high: Optional[float],
    last_dt: Optional[float],
    last_r: Optional[float],
    tick_size: float,
    tolerance_abs: float,
    tolerance_pct: float,
) -> Label:
    """
    Mark a broken-bar high.
    - Clear expansion above last BU → BU (Teji)
    - Same area as BU / recent swing high → DT (Atak)
    - Otherwise a lower high → R (reaction), never endless DT cascade
    """
    if last_bu is None and last_swing_high is None:
        return Label.BU

    # Classic Atak vs prior Teji high
    if last_bu is not None and within_tolerance(
        last_bu, price, tick_size=tick_size, tolerance_abs=tolerance_abs, tolerance_pct=tolerance_pct
    ):
        return Label.DT
    if last_bu is not None and price > last_bu:
        return Label.BU

    # Local Atak vs most recent swing / prior DT only (not every lower high)
    if _near_any(
        price,
        [last_swing_high, last_dt],
        tick_size=tick_size,
        tolerance_abs=tolerance_abs,
        tolerance_pct=tolerance_pct,
    ):
        return Label.DT

    # Clearly lower than recent swing high → reaction pullback
    return Label.R


def _classify_low(
    price: float,
    *,
    last_be: Optional[float],
    last_swing_low: Optional[float],
    last_db: Optional[float],
    last_r: Optional[float],
    tick_size: float,
    tolerance_abs: float,
    tolerance_pct: float,
) -> Label:
    """
    Mark a taken-out-bar low — prefer *recent* swing lows over ancient BE.
    - Clear lower low vs recent structure → BE (Mandi)
    - Same area as recent low / prior DB → DB (Atak)
    - Higher low after strength → R
    """
    # Anchor to the most recent structural low when available
    ref_low = last_swing_low if last_swing_low is not None else last_be

    if ref_low is None:
        return Label.BE

    if within_tolerance(
        ref_low, price, tick_size=tick_size, tolerance_abs=tolerance_abs, tolerance_pct=tolerance_pct
    ):
        return Label.DB

    if price < ref_low:
        return Label.BE

    # Higher low — Atak if it retests a known DB/R pocket, else reaction
    if _near_any(
        price,
        [last_db, last_r],
        tick_size=tick_size,
        tolerance_abs=tolerance_abs,
        tolerance_pct=tolerance_pct,
    ):
        return Label.DB
    return Label.R


def analyze_bars(
    bars: list[Bar],
    *,
    tick_size: float = 0.05,
    tolerance_abs: float = 1.0,
    tolerance_pct: float = 0.15,
) -> AnalysisResult:
    """
    Apply VNS Rules A/B on OHLC bars (typically daily).

    Rule A: when a prior bar's low is broken → mark that prior bar's high (Col 4).
    Rule B: when a prior bar's high is taken out → mark that prior bar's low (Col 5).
    """
    result = AnalysisResult()
    if len(bars) < 2:
        return result

    marks: list[Mark] = []
    last_bu: Optional[float] = None
    last_be: Optional[float] = None
    last_r: Optional[float] = None
    last_dt: Optional[float] = None
    last_db: Optional[float] = None
    last_swing_high: Optional[float] = None
    last_swing_low: Optional[float] = None
    last_label: Optional[Label] = None
    last_atak_label: Optional[Label] = None  # most recent DT or DB

    pending_high_bar: Optional[Bar] = bars[0]
    pending_low_bar: Optional[Bar] = bars[0]

    for i in range(1, len(bars)):
        bar = bars[i]
        d = bar.ts.date() if isinstance(bar.ts, datetime) else bar.ts

        # Rule A: low of pending_high_bar broken → mark that high
        if pending_high_bar is not None and bar.low < pending_high_bar.low:
            price = pending_high_bar.high
            label = _classify_high(
                price,
                last_bu=last_bu,
                last_swing_high=last_swing_high,
                last_dt=last_dt,
                last_r=last_r,
                tick_size=tick_size,
                tolerance_abs=tolerance_abs,
                tolerance_pct=tolerance_pct,
            )
            marks.append(
                Mark(
                    mark_date=pending_high_bar.ts.date()
                    if isinstance(pending_high_bar.ts, datetime)
                    else pending_high_bar.ts,
                    column_side="BU",
                    price=price,
                    label=label,
                    note=f"low broken on {d.isoformat()}",
                )
            )
            last_label = label
            last_swing_high = price
            if label == Label.BU:
                last_bu = price
            elif label == Label.DT:
                last_dt = price
                last_atak_label = Label.DT
                if last_bu is None:
                    last_bu = price
            elif label == Label.R:
                last_r = price

            pending_low_bar = pending_high_bar
            pending_high_bar = bar

        # Rule B: high of pending_low_bar taken out → mark that low
        if pending_low_bar is not None and bar.high > pending_low_bar.high:
            price = pending_low_bar.low
            label = _classify_low(
                price,
                last_be=last_be,
                last_swing_low=last_swing_low,
                last_db=last_db,
                last_r=last_r,
                tick_size=tick_size,
                tolerance_abs=tolerance_abs,
                tolerance_pct=tolerance_pct,
            )
            marks.append(
                Mark(
                    mark_date=pending_low_bar.ts.date()
                    if isinstance(pending_low_bar.ts, datetime)
                    else pending_low_bar.ts,
                    column_side="BE",
                    price=price,
                    label=label,
                    note=f"high taken out on {d.isoformat()}",
                )
            )
            last_label = label
            prev_swing = last_swing_low
            last_swing_low = price
            if label == Label.BE:
                last_be = price
            elif label == Label.DB:
                last_db = price
                last_atak_label = Label.DB
                # Keep Mandi reference near the Atak pocket (recent lows), not ancient BE
                if last_be is None or (prev_swing is not None and last_be < prev_swing * 0.5):
                    last_be = price
            elif label == Label.R:
                last_r = price

            pending_high_bar = pending_low_bar
            pending_low_bar = bar

        if pending_high_bar is None:
            pending_high_bar = bar
        if pending_low_bar is None:
            pending_low_bar = bar

    # When Rule A/B pendings stall in a range, still read Atak from recent swing
    # extremes (most recent lows/highs) — this is what discretionary VNS does.
    swing_lows = _swing_extremes(bars, side="low", lookback=20)
    swing_highs = _swing_extremes(bars, side="high", lookback=20)
    recent_db = _atak_from_swings(
        swing_lows,
        tick_size=tick_size,
        tolerance_abs=tolerance_abs,
        tolerance_pct=tolerance_pct,
    )
    recent_dt = _atak_from_swings(
        swing_highs,
        tick_size=tick_size,
        tolerance_abs=tolerance_abs,
        tolerance_pct=tolerance_pct,
    )
    if recent_db is not None:
        db_price, db_date = recent_db
        last_db = db_price
        if last_be is None or last_be < db_price * 0.85:
            last_be = db_price
        # Only append a synthetic mark if we don't already have a recent DB nearby
        if not any(
            m.label == Label.DB and abs(m.price - db_price) / max(db_price, 1e-9) < 0.01
            and m.mark_date >= db_date
            for m in marks[-12:]
        ):
            marks.append(
                Mark(
                    mark_date=db_date,
                    column_side="BE",
                    price=db_price,
                    label=Label.DB,
                    note="recent swing lows holding (Atak)",
                )
            )
        last_label = Label.DB
        last_atak_label = Label.DB
        last_swing_low = db_price
    if recent_dt is not None and recent_db is not None:
        # Prefer the more recent swing Atak (lows vs highs by date)
        _, db_date = recent_db
        _, dt_date = recent_dt
        if dt_date > db_date:
            dt_price, _ = recent_dt
            last_dt = dt_price
            last_label = Label.DT
            last_atak_label = Label.DT
            if not any(
                m.label == Label.DT and abs(m.price - dt_price) / max(dt_price, 1e-9) < 0.01
                and m.mark_date >= dt_date
                for m in marks[-12:]
            ):
                marks.append(
                    Mark(
                        mark_date=dt_date,
                        column_side="BU",
                        price=dt_price,
                        label=Label.DT,
                        note="recent swing highs failing (Atak)",
                    )
                )
    elif recent_dt is not None and recent_db is None:
        dt_price, dt_date = recent_dt
        last_dt = dt_price
        last_label = Label.DT
        last_atak_label = Label.DT
        if not any(
            m.label == Label.DT and abs(m.price - dt_price) / max(dt_price, 1e-9) < 0.01
            and m.mark_date >= dt_date
            for m in marks[-12:]
        ):
            marks.append(
                Mark(
                    mark_date=dt_date,
                    column_side="BU",
                    price=dt_price,
                    label=Label.DT,
                    note="recent swing highs failing (Atak)",
                )
            )

    result.marks = marks
    result.last_bu = last_bu
    result.last_be = last_be
    result.last_r = last_r
    result.last_dt = last_dt
    result.last_db = last_db
    result.as_of = bars[-1].ts

    # Trend heuristic — prefer most recent Atak when deciding exhausted vs reactive
    if last_bu is not None and last_be is not None:
        if last_label == Label.BU:
            result.trend = "bullish"
        elif last_label == Label.BE:
            result.trend = "bearish"
        elif last_label == Label.DT or (last_atak_label == Label.DT and last_label == Label.R):
            result.trend = "bullish_exhausted"
        elif last_label == Label.DB or (last_atak_label == Label.DB and last_label in {Label.R, Label.DB}):
            result.trend = "bearish_exhausted"
        else:
            result.trend = "reactive"
    elif last_bu is not None:
        result.trend = "bullish"
    elif last_be is not None:
        result.trend = "bearish"

    last_close = bars[-1].close
    signal = Signal.NONE
    note = ""
    stop: Optional[float] = None

    # Mode B Atak: most recent DT/DB wins. If last mark is R after Atak, keep that Atak.
    effective_atak = last_label if last_label in {Label.DT, Label.DB} else last_atak_label
    if last_label == Label.R and last_atak_label is not None:
        effective_atak = last_atak_label

    if effective_atak == Label.DB and last_db is not None:
        signal = Signal.DB_LONG
        note = f"Atak (DB) near {last_db:.2f} — recent lows holding"
        stop = min(last_db, last_be or last_db)
    elif effective_atak == Label.DT and last_dt is not None:
        signal = Signal.DT_SHORT
        note = f"Atak (DT) near {last_dt:.2f} — recent highs failing"
        stop = max(last_dt, last_bu or last_dt)
    elif last_bu is not None and last_be is not None and last_close > last_bu and last_label in {
        Label.BE,
        Label.R,
        Label.BU,
        Label.DB,
    }:
        if last_be < last_bu:
            signal = Signal.BREAKOUT_LONG
            note = f"Breakout above BU {last_bu:.2f}"
            stop = last_be
    elif last_bu is not None and last_be is not None and last_close < last_be and last_label in {
        Label.BU,
        Label.R,
        Label.BE,
        Label.DT,
    }:
        if last_be < last_bu and last_be > last_close * 0.5:
            signal = Signal.BREAKDOWN_SHORT
            note = f"Breakdown below BE {last_be:.2f}"
            stop = last_bu

    # Sideways only for tight recent bands — never override Mode B Atak
    if signal not in {Signal.DT_SHORT, Signal.DB_LONG}:
        if last_dt is not None and last_db is not None and last_bu is not None and last_be is not None:
            if last_be < last_close < last_bu and last_label in {Label.DT, Label.DB, Label.R}:
                band = last_bu - last_be
                if (
                    band > 0
                    and band / max(last_close, 1e-9) <= 0.28
                    and abs(last_dt - last_bu) / band < 0.35
                ):
                    signal = Signal.SIDEWAYS
                    note = "Range / repeated DT-DB — avoid forced trades"
                    stop = None

    result.signal = signal
    result.signal_note = note
    result.stop_hint = stop
    return result
