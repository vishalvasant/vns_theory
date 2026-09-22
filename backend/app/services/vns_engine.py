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


def _classify_high(
    price: float,
    prev_bu: Optional[float],
    *,
    tick_size: float,
    tolerance_abs: float,
    tolerance_pct: float,
    after_be: bool,
) -> Label:
    if prev_bu is None:
        return Label.BU
    if within_tolerance(
        prev_bu, price, tick_size=tick_size, tolerance_abs=tolerance_abs, tolerance_pct=tolerance_pct
    ):
        return Label.DT
    if price > prev_bu:
        return Label.BU
    # Lower high after bearish phase is typically reaction / atak area
    if after_be:
        return Label.R
    return Label.DT


def _classify_low(
    price: float,
    prev_be: Optional[float],
    *,
    tick_size: float,
    tolerance_abs: float,
    tolerance_pct: float,
    after_bu: bool,
) -> Label:
    if prev_be is None:
        return Label.BE
    if within_tolerance(
        prev_be, price, tick_size=tick_size, tolerance_abs=tolerance_abs, tolerance_pct=tolerance_pct
    ):
        return Label.DB
    if price < prev_be:
        return Label.BE
    if after_bu:
        return Label.R
    return Label.DB


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
    last_label: Optional[Label] = None

    # Active reference bar waiting to be broken on the opposite side
    # We use previous bar as the immediate structure reference (manual notebook style).
    pending_high_bar: Optional[Bar] = None  # waiting for its low to break → mark high
    pending_low_bar: Optional[Bar] = None  # waiting for its high to take out → mark low

    # Start: first bar seeds both pending references
    pending_high_bar = bars[0]
    pending_low_bar = bars[0]

    for i in range(1, len(bars)):
        bar = bars[i]
        d = bar.ts.date() if isinstance(bar.ts, datetime) else bar.ts

        # Rule A: low of pending_high_bar broken → mark that high
        if pending_high_bar is not None and bar.low < pending_high_bar.low:
            price = pending_high_bar.high
            after_be = last_label in {Label.BE, Label.DB, Label.R} and last_be is not None
            # If we're coming from BE, a bounce high below prior BU is often R
            if last_be is not None and last_label in {Label.BE, Label.DB} and price < (last_bu or price):
                # Reaction high after BE unless it expands to new BU/DT vs last_bu
                if last_bu is not None and within_tolerance(
                    last_bu, price, tick_size=tick_size, tolerance_abs=tolerance_abs, tolerance_pct=tolerance_pct
                ):
                    label = Label.DT
                elif last_bu is not None and price > last_bu:
                    label = Label.BU
                else:
                    label = Label.R
            else:
                label = _classify_high(
                    price,
                    last_bu,
                    tick_size=tick_size,
                    tolerance_abs=tolerance_abs,
                    tolerance_pct=tolerance_pct,
                    after_be=after_be,
                )

            mark = Mark(
                mark_date=pending_high_bar.ts.date(),
                column_side="BU",
                price=price,
                label=label,
                note=f"low broken on {d.isoformat()}",
            )
            marks.append(mark)
            last_label = label
            if label == Label.BU:
                last_bu = price
            elif label == Label.DT:
                last_dt = price
                if last_bu is None:
                    last_bu = price
            elif label == Label.R:
                last_r = price

            # After marking high, wait for that high (or later) to be taken out → mark low
            pending_low_bar = pending_high_bar
            pending_high_bar = bar

        # Rule B: high of pending_low_bar taken out → mark that low
        if pending_low_bar is not None and bar.high > pending_low_bar.high:
            price = pending_low_bar.low
            after_bu = last_label in {Label.BU, Label.DT, Label.R} and last_bu is not None
            if last_bu is not None and last_label in {Label.BU, Label.DT} and price > (last_be or 0):
                if last_be is not None and within_tolerance(
                    last_be, price, tick_size=tick_size, tolerance_abs=tolerance_abs, tolerance_pct=tolerance_pct
                ):
                    label = Label.DB
                elif last_be is not None and price < last_be:
                    label = Label.BE
                else:
                    label = Label.R
            else:
                label = _classify_low(
                    price,
                    last_be,
                    tick_size=tick_size,
                    tolerance_abs=tolerance_abs,
                    tolerance_pct=tolerance_pct,
                    after_bu=after_bu,
                )

            mark = Mark(
                mark_date=pending_low_bar.ts.date(),
                column_side="BE",
                price=price,
                label=label,
                note=f"high taken out on {d.isoformat()}",
            )
            marks.append(mark)
            last_label = label
            if label == Label.BE:
                last_be = price
            elif label == Label.DB:
                last_db = price
                if last_be is None:
                    last_be = price
            elif label == Label.R:
                last_r = price

            pending_high_bar = pending_low_bar
            pending_low_bar = bar

        # Keep pending refs on the latest bar when no break yet (rolling structure)
        if pending_high_bar is None:
            pending_high_bar = bar
        if pending_low_bar is None:
            pending_low_bar = bar

    result.marks = marks
    result.last_bu = last_bu
    result.last_be = last_be
    result.last_r = last_r
    result.last_dt = last_dt
    result.last_db = last_db
    result.as_of = bars[-1].ts

    # Trend heuristic
    if last_bu is not None and last_be is not None:
        if last_label in {Label.BU, Label.DT}:
            result.trend = "bullish" if last_label == Label.BU else "bullish_exhausted"
        elif last_label in {Label.BE, Label.DB}:
            result.trend = "bearish" if last_label == Label.BE else "bearish_exhausted"
        else:
            result.trend = "reactive"
    elif last_bu is not None:
        result.trend = "bullish"
    elif last_be is not None:
        result.trend = "bearish"

    # Signals (Mode A breakout + Mode B DT/DB)
    last_close = bars[-1].close
    signal = Signal.NONE
    note = ""
    stop: Optional[float] = None

    if last_label == Label.DT and last_dt is not None:
        signal = Signal.DT_SHORT
        note = f"Double top near {last_dt:.2f} (tolerance-aware)"
        stop = max(last_dt, last_bu or last_dt)
    elif last_label == Label.DB and last_db is not None:
        signal = Signal.DB_LONG
        note = f"Double bottom near {last_db:.2f} (tolerance-aware)"
        stop = min(last_db, last_be or last_db)
    elif last_bu is not None and last_be is not None and last_close > last_bu and last_label in {
        Label.BE,
        Label.R,
        Label.BU,
        Label.DB,
    }:
        # Classic breakout: price crosses BU after bearish/reaction phase
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
        if last_be < last_bu:
            signal = Signal.BREAKDOWN_SHORT
            note = f"Breakdown below BE {last_be:.2f}"
            stop = last_bu

    # Sideways: both DT and DB recently and price between band
    if last_dt is not None and last_db is not None and last_bu is not None and last_be is not None:
        if last_be < last_close < last_bu and last_label in {Label.DT, Label.DB, Label.R}:
            band = last_bu - last_be
            if band > 0 and abs(last_dt - last_bu) / band < 0.35:
                signal = Signal.SIDEWAYS
                note = "Range / repeated DT-DB — avoid forced trades"
                stop = None

    result.signal = signal
    result.signal_note = note
    result.stop_hint = stop
    return result
