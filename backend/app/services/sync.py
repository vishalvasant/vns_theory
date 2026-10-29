from __future__ import annotations

import asyncio
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import delete, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

IST = ZoneInfo("Asia/Kolkata")

from app.models import (
    Candle,
    Instrument,
    MarkLabel,
    SignalType,
    Timeframe,
    VnsAnalysis,
    VnsMark,
    WatchlistItem,
)
from app.services.instruments_master import MasterInstrument
from app.services.upstox import UpstoxClient, UpstoxError
from app.services.vns_engine import Bar, Label, Signal, analyze_bars

SEED_PATH = Path(__file__).resolve().parent.parent / "seed" / "nifty50.json"

LABEL_MAP = {
    Label.BU: MarkLabel.BU,
    Label.BE: MarkLabel.BE,
    Label.R: MarkLabel.R,
    Label.DT: MarkLabel.DT,
    Label.DB: MarkLabel.DB,
}

SIGNAL_MAP = {
    Signal.BREAKOUT_LONG: SignalType.BREAKOUT_LONG,
    Signal.BREAKDOWN_SHORT: SignalType.BREAKDOWN_SHORT,
    Signal.DT_SHORT: SignalType.DT_SHORT,
    Signal.DB_LONG: SignalType.DB_LONG,
    Signal.SIDEWAYS: SignalType.SIDEWAYS,
    Signal.NONE: SignalType.NONE,
}

# Upstox v3 historical lookback ceilings (per-request limits)
TIMEFRAME_DAYS_BACK: dict[Timeframe, int] = {
    Timeframe.MINUTE_15: 30,  # v3: ≤15m intervals → max ~1 month
    Timeframe.MINUTE_30: 90,  # v3: >15m minutes → max ~1 quarter
    Timeframe.HOUR_1: 90,
    Timeframe.HOUR_4: 90,
    Timeframe.DAY: 3650,
    Timeframe.WEEK: 3650,
    Timeframe.MONTH: 3650,
}

ALL_TIMEFRAMES: list[Timeframe] = [
    Timeframe.MINUTE_15,
    Timeframe.MINUTE_30,
    Timeframe.HOUR_1,
    Timeframe.HOUR_4,
    Timeframe.DAY,
    Timeframe.WEEK,
    Timeframe.MONTH,
]

INTRADAY_TIMEFRAMES = {
    Timeframe.MINUTE_15,
    Timeframe.MINUTE_30,
    Timeframe.HOUR_1,
    Timeframe.HOUR_4,
}


def instrument_key_from_isin(isin: str) -> str:
    return f"NSE_EQ|{isin}"


def _tolerance_for_tick(tick_size: float) -> tuple[float, float]:
    tick = tick_size if tick_size > 0 else 0.05
    tol_abs = max(tick * 4, 0.5)
    tol_pct = 0.15
    return tol_abs, tol_pct


async def ensure_instrument_from_master(
    db: AsyncSession,
    hit: MasterInstrument,
    *,
    is_nifty50: bool = False,
) -> Instrument:
    existing = await db.execute(
        select(Instrument).where(Instrument.instrument_key == hit.instrument_key)
    )
    inst = existing.scalar_one_or_none()
    if inst:
        inst.name = hit.name or inst.name
        inst.exchange = hit.exchange
        inst.segment = hit.segment
        inst.isin = hit.isin or inst.isin
        inst.trading_symbol = hit.trading_symbol
        inst.tick_size = hit.tick_size
        inst.is_active = True
        if is_nifty50:
            inst.is_nifty50 = True
        await db.commit()
        await db.refresh(inst)
        return inst

    by_symbol = await db.execute(select(Instrument).where(Instrument.symbol == hit.symbol))
    conflict = by_symbol.scalar_one_or_none()
    if conflict and conflict.instrument_key != hit.instrument_key:
        # Extremely rare: keep existing symbol owner; qualify with exchange token
        symbol = f"{hit.symbol}.{hit.exchange}"
    else:
        symbol = hit.symbol

    tol_abs, tol_pct = _tolerance_for_tick(hit.tick_size)
    inst = Instrument(
        symbol=symbol,
        name=hit.name,
        exchange=hit.exchange,
        segment=hit.segment,
        isin=hit.isin,
        trading_symbol=hit.trading_symbol,
        instrument_key=hit.instrument_key,
        is_nifty50=is_nifty50,
        tick_size=hit.tick_size,
        tolerance_abs=tol_abs,
        tolerance_pct=tol_pct,
        is_active=True,
    )
    db.add(inst)
    await db.commit()
    await db.refresh(inst)
    return inst


async def add_to_watchlist(db: AsyncSession, user_id: int, instrument_id: int) -> WatchlistItem:
    existing = await db.execute(
        select(WatchlistItem).where(
            WatchlistItem.user_id == user_id,
            WatchlistItem.instrument_id == instrument_id,
        )
    )
    item = existing.scalar_one_or_none()
    if item:
        return item
    item = WatchlistItem(user_id=user_id, instrument_id=instrument_id)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def seed_nifty50(db: AsyncSession) -> int:
    data = json.loads(SEED_PATH.read_text())
    created = 0
    for row in data:
        symbol = row["symbol"]
        existing = await db.execute(select(Instrument).where(Instrument.symbol == symbol))
        if existing.scalar_one_or_none():
            continue
        isin = row["isin"]
        db.add(
            Instrument(
                symbol=symbol,
                name=row["name"],
                isin=isin,
                trading_symbol=row["trading_symbol"],
                instrument_key=instrument_key_from_isin(isin),
                is_nifty50=True,
                tick_size=0.05,
                tolerance_abs=1.0,
                tolerance_pct=0.15,
            )
        )
        created += 1
    await db.commit()
    return created


def _parse_ts(value: str | int | float) -> datetime:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000 if value > 10_000_000_000 else value, tz=timezone.utc)
    text = str(value).replace("Z", "+00:00")
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _bar_ts(value: str | int | float, timeframe: Timeframe) -> datetime:
    """
    Normalize candle timestamps.
    For day/week/month, pin to the Asia/Kolkata calendar date at 00:00 UTC
    so API clients don't shift the trading date when serializing timestamptz.
    """
    dt = _parse_ts(value)
    if timeframe in {Timeframe.DAY, Timeframe.WEEK, Timeframe.MONTH}:
        local = dt.astimezone(IST)
        return datetime(local.year, local.month, local.day, tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def sync_instrument_candles(
    db: AsyncSession,
    instrument: Instrument,
    timeframe: Timeframe = Timeframe.DAY,
    days_back: int | None = None,
) -> int:
    client = UpstoxClient()
    lookback = days_back if days_back is not None else TIMEFRAME_DAYS_BACK[timeframe]
    to_d = date.today()
    from_d = to_d - timedelta(days=lookback)
    rows = await client.get_historical_candles(
        instrument.instrument_key,
        timeframe.value,
        to_d,
        from_d,
    )
    # Historical endpoint often omits the live / incomplete session —
    # merge today's candles for intraday TFs and the forming daily bar.
    if timeframe in INTRADAY_TIMEFRAMES or timeframe == Timeframe.DAY:
        try:
            today_rows = await client.get_intraday_candles(
                instrument.instrument_key,
                timeframe.value,
            )
            if today_rows:
                rows = list(rows or []) + list(today_rows)
        except UpstoxError:
            pass
    if not rows:
        instrument.last_synced_at = datetime.now(timezone.utc)
        await db.commit()
        return 0

    payload = []
    for row in rows:
        payload.append(
            {
                "instrument_id": instrument.id,
                "timeframe": timeframe,
                "ts": _bar_ts(row[0], timeframe),
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "volume": float(row[5] or 0),
            }
        )

    # Deduplicate by ts within batch
    by_ts = {p["ts"]: p for p in payload}
    payload = list(by_ts.values())
    # Day/week/month: also collapse to one bar per calendar date (prefer higher volume /
    # later session merge so today's forming bar wins over a stale historical stub).
    if timeframe in {Timeframe.DAY, Timeframe.WEEK, Timeframe.MONTH}:
        by_day: dict = {}
        for p in payload:
            key = p["ts"].date() if hasattr(p["ts"], "date") else p["ts"]
            prev = by_day.get(key)
            if prev is None or float(p.get("volume") or 0) >= float(prev.get("volume") or 0):
                by_day[key] = p
        payload = list(by_day.values())

    chunk_size = 500
    for i in range(0, len(payload), chunk_size):
        chunk = payload[i : i + chunk_size]
        stmt = insert(Candle).values(chunk)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_candle_instrument_tf_ts",
            set_={
                "open": stmt.excluded.open,
                "high": stmt.excluded.high,
                "low": stmt.excluded.low,
                "close": stmt.excluded.close,
                "volume": stmt.excluded.volume,
            },
        )
        await db.execute(stmt)

    instrument.last_synced_at = datetime.now(timezone.utc)
    await db.commit()
    return len(payload)


async def run_vns_for_instrument(
    db: AsyncSession,
    instrument: Instrument,
    timeframe: Timeframe = Timeframe.DAY,
) -> VnsAnalysis:
    result = await db.execute(
        select(Candle)
        .where(Candle.instrument_id == instrument.id, Candle.timeframe == timeframe)
        .order_by(Candle.ts.asc())
    )
    candles = list(result.scalars().all())
    # Guard against duplicate calendar bars corrupting structure (common after merges)
    if timeframe in {Timeframe.DAY, Timeframe.WEEK, Timeframe.MONTH}:
        by_day: dict = {}
        for c in candles:
            key = c.ts.astimezone(IST).date() if c.ts.tzinfo else c.ts.date()
            prev = by_day.get(key)
            if prev is None or (c.volume or 0) >= (prev.volume or 0):
                by_day[key] = c
        candles = [by_day[k] for k in sorted(by_day.keys())]
    bars = [
        Bar(ts=c.ts, open=c.open, high=c.high, low=c.low, close=c.close) for c in candles
    ]
    # Slightly looser abs tolerance on higher TFs; day needs enough room for
    # high-priced stocks (Atak vs recent swing, not tick-exact).
    tol_abs = instrument.tolerance_abs
    tol_pct = instrument.tolerance_pct
    if timeframe in {Timeframe.WEEK, Timeframe.MONTH}:
        tol_abs = max(tol_abs, instrument.tolerance_abs * 3)
        tol_pct = max(tol_pct, 0.25)
    elif timeframe == Timeframe.DAY:
        tol_abs = max(tol_abs, instrument.tick_size * 20, 1.0)
        tol_pct = max(tol_pct, 0.25)
    elif timeframe in {Timeframe.MINUTE_15, Timeframe.MINUTE_30}:
        tol_abs = max(instrument.tick_size * 4, instrument.tolerance_abs * 0.5)

    analysis = analyze_bars(
        bars,
        tick_size=instrument.tick_size,
        tolerance_abs=tol_abs,
        tolerance_pct=tol_pct,
    )

    await db.execute(
        delete(VnsMark).where(
            VnsMark.instrument_id == instrument.id,
            VnsMark.timeframe == timeframe,
        )
    )
    for m in analysis.marks:
        db.add(
            VnsMark(
                instrument_id=instrument.id,
                timeframe=timeframe,
                mark_date=m.mark_date,
                column_side=m.column_side,
                price=m.price,
                label=LABEL_MAP[m.label],
                note=m.note,
            )
        )

    existing = await db.execute(
        select(VnsAnalysis).where(
            VnsAnalysis.instrument_id == instrument.id,
            VnsAnalysis.timeframe == timeframe,
        )
    )
    row = existing.scalar_one_or_none()
    if not row:
        row = VnsAnalysis(instrument_id=instrument.id, timeframe=timeframe)
        db.add(row)

    row.trend = analysis.trend
    row.last_bu = analysis.last_bu
    row.last_be = analysis.last_be
    row.last_r = analysis.last_r
    row.last_dt = analysis.last_dt
    row.last_db = analysis.last_db
    row.signal = SIGNAL_MAP[analysis.signal]
    row.signal_note = analysis.signal_note
    row.stop_hint = analysis.stop_hint
    row.as_of = analysis.as_of
    await db.commit()
    await db.refresh(row)
    return row


async def sync_all_nifty50(
    db: AsyncSession,
    timeframe: Timeframe | None = None,
    days_back: int | None = None,
    symbol: str | None = None,
    timeframes: list[Timeframe] | None = None,
    *,
    include_watchlist: bool = True,
) -> dict:
    """
    Sync candles + VNS for active instruments.
    - With symbol: that instrument only (Nifty or user-opened).
    - Without symbol: Nifty 50 + any watchlisted scripts (scheduled worker).
    """
    q = select(Instrument).where(Instrument.is_active.is_(True))
    if symbol:
        q = q.where(Instrument.symbol == symbol.upper())
    elif include_watchlist:
        watched = select(WatchlistItem.instrument_id).distinct()
        q = q.where(or_(Instrument.is_nifty50.is_(True), Instrument.id.in_(watched)))
    else:
        q = q.where(Instrument.is_nifty50.is_(True))
    result = await db.execute(q)
    instruments = list(result.scalars().all())

    tfs = timeframes or ([timeframe] if timeframe else ALL_TIMEFRAMES)

    synced = 0
    analyzed = 0
    candle_rows = 0
    errors: list[str] = []
    details: list[dict] = []

    for inst in instruments:
        for tf in tfs:
            try:
                n = await sync_instrument_candles(
                    db,
                    inst,
                    timeframe=tf,
                    days_back=days_back if days_back is not None else TIMEFRAME_DAYS_BACK[tf],
                )
                candle_rows += n
                synced += 1
                await run_vns_for_instrument(db, inst, timeframe=tf)
                analyzed += 1
                details.append({"symbol": inst.symbol, "timeframe": tf.value, "candles": n})
                await asyncio.sleep(0.15)  # gentle Upstox rate pacing
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{inst.symbol}/{tf.value}: {exc}")

    return {
        "instruments": len(instruments),
        "timeframes": [tf.value for tf in tfs],
        "synced": synced,
        "analyzed": analyzed,
        "candle_rows": candle_rows,
        "errors": errors,
        "details": details[:20],
    }
