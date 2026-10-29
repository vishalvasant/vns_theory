from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.db import get_db
from app.models import Candle, Instrument, Timeframe, User, VnsAnalysis, VnsMark, WatchlistItem
from app.schemas import (
    AnalysisOut,
    CandleOut,
    InstrumentOut,
    InstrumentSearchHit,
    MarkOut,
    OpenInstrumentRequest,
    OpenInstrumentResponse,
    SyncRequest,
)
from app.services.instruments_master import find_by_instrument_key, search_instruments
from app.services.sync import (
    add_to_watchlist,
    ensure_instrument_from_master,
    seed_nifty50,
    sync_all_nifty50,
)

router = APIRouter(tags=["market"])


@router.get("/instruments", response_model=list[InstrumentOut])
async def list_instruments(
    nifty50_only: bool = False,
    watchlist_only: bool = False,
    scope: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Instrument]:
    """
    scope: watchlist | nifty50 | all
    Defaults to watchlist when the user has items, otherwise nifty50.
    """
    effective = (scope or "").lower().strip()
    if not effective:
        if watchlist_only:
            effective = "watchlist"
        elif nifty50_only:
            effective = "nifty50"
        else:
            has_watch = await db.scalar(
                select(WatchlistItem.id).where(WatchlistItem.user_id == user.id).limit(1)
            )
            effective = "watchlist" if has_watch is not None else "nifty50"

    if effective == "watchlist":
        watched = list(
            (
                await db.execute(
                    select(Instrument)
                    .join(WatchlistItem, WatchlistItem.instrument_id == Instrument.id)
                    .where(WatchlistItem.user_id == user.id, Instrument.is_active.is_(True))
                    .order_by(WatchlistItem.created_at.desc())
                )
            )
            .scalars()
            .unique()
            .all()
        )
        nifty = list(
            (
                await db.execute(
                    select(Instrument)
                    .where(Instrument.is_active.is_(True), Instrument.is_nifty50.is_(True))
                    .order_by(Instrument.symbol)
                )
            )
            .scalars()
            .all()
        )
        # Saved scripts first, then Nifty 50 starters (deduped)
        seen: set[int] = set()
        merged: list[Instrument] = []
        for row in watched + nifty:
            if row.id in seen:
                continue
            seen.add(row.id)
            merged.append(row)
        return merged

    q = select(Instrument).where(Instrument.is_active.is_(True)).order_by(Instrument.symbol)
    if effective == "nifty50":
        q = q.where(Instrument.is_nifty50.is_(True))
    result = await db.execute(q)
    return list(result.scalars().all())


@router.get("/instruments/search", response_model=list[InstrumentSearchHit])
async def instruments_search(
    q: str = Query(min_length=1, max_length=64),
    exchange: str | None = Query(default=None, pattern="^(NSE|BSE|nse|bse)$"),
    limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[InstrumentSearchHit]:
    hits = await search_instruments(q, exchange=exchange, limit=limit)
    keys = [h.instrument_key for h in hits]
    existing_keys: set[str] = set()
    if keys:
        existing = await db.execute(
            select(Instrument.instrument_key).where(Instrument.instrument_key.in_(keys))
        )
        existing_keys = set(existing.scalars().all())
    return [
        InstrumentSearchHit(
            exchange=h.exchange,
            segment=h.segment,
            symbol=h.symbol,
            trading_symbol=h.trading_symbol,
            name=h.name,
            isin=h.isin,
            instrument_key=h.instrument_key,
            tick_size=h.tick_size,
            instrument_type=h.instrument_type,
            in_library=h.instrument_key in existing_keys,
        )
        for h in hits
    ]


@router.post("/instruments/open", response_model=OpenInstrumentResponse)
async def open_instrument(
    payload: OpenInstrumentRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OpenInstrumentResponse:
    hit = await find_by_instrument_key(payload.instrument_key)
    if not hit:
        # Allow reopening keys already stored even if master cache is stale
        existing = (
            await db.execute(
                select(Instrument).where(Instrument.instrument_key == payload.instrument_key)
            )
        ).scalar_one_or_none()
        if not existing:
            raise HTTPException(status_code=404, detail="Instrument not found in NSE/BSE master")
        inst = existing
    else:
        inst = await ensure_instrument_from_master(db, hit)

    await add_to_watchlist(db, user.id, inst.id)

    sync_result = None
    if payload.sync:
        tfs = None if payload.all_timeframes else [Timeframe.DAY]
        sync_result = await sync_all_nifty50(
            db,
            symbol=inst.symbol,
            timeframes=tfs,
        )

    return OpenInstrumentResponse(
        instrument=InstrumentOut.model_validate(inst),
        added_to_watchlist=True,
        sync=sync_result,
    )


@router.delete("/watchlist/{symbol}")
async def remove_watchlist_item(
    symbol: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    inst = (
        await db.execute(select(Instrument).where(Instrument.symbol == symbol.upper()))
    ).scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Instrument not found")
    await db.execute(
        delete(WatchlistItem).where(
            WatchlistItem.user_id == user.id,
            WatchlistItem.instrument_id == inst.id,
        )
    )
    await db.commit()
    return {"removed": True, "symbol": inst.symbol}


@router.get("/instruments/{symbol}", response_model=InstrumentOut)
async def get_instrument(
    symbol: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Instrument:
    result = await db.execute(select(Instrument).where(Instrument.symbol == symbol.upper()))
    inst = result.scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Instrument not found")
    return inst


@router.get("/instruments/{symbol}/candles", response_model=list[CandleOut])
async def get_candles(
    symbol: str,
    timeframe: Timeframe = Timeframe.DAY,
    limit: int = Query(default=1500, le=10000),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CandleOut]:
    inst = (
        await db.execute(select(Instrument).where(Instrument.symbol == symbol.upper()))
    ).scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Instrument not found")
    result = await db.execute(
        select(Candle)
        .where(Candle.instrument_id == inst.id, Candle.timeframe == timeframe)
        .order_by(Candle.ts.desc())
        .limit(limit)
    )
    candles = list(reversed(list(result.scalars().all())))
    return [
        CandleOut(
            ts=c.ts,
            open=c.open,
            high=c.high,
            low=c.low,
            close=c.close,
            volume=c.volume,
        )
        for c in candles
    ]


@router.get("/instruments/{symbol}/analysis", response_model=AnalysisOut)
async def get_analysis(
    symbol: str,
    timeframe: Timeframe = Timeframe.DAY,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> AnalysisOut:
    inst = (
        await db.execute(select(Instrument).where(Instrument.symbol == symbol.upper()))
    ).scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Instrument not found")

    analysis = (
        await db.execute(
            select(VnsAnalysis).where(
                VnsAnalysis.instrument_id == inst.id,
                VnsAnalysis.timeframe == timeframe,
            )
        )
    ).scalar_one_or_none()
    marks = (
        await db.execute(
            select(VnsMark)
            .where(VnsMark.instrument_id == inst.id, VnsMark.timeframe == timeframe)
            .order_by(VnsMark.mark_date.asc())
        )
    ).scalars().all()

    if not analysis:
        raise HTTPException(
            status_code=404,
            detail="Analysis not ready. Run sync first.",
        )

    return AnalysisOut(
        instrument=InstrumentOut.model_validate(inst),
        timeframe=timeframe,
        trend=analysis.trend,
        last_bu=analysis.last_bu,
        last_be=analysis.last_be,
        last_r=analysis.last_r,
        last_dt=analysis.last_dt,
        last_db=analysis.last_db,
        signal=analysis.signal,
        signal_note=analysis.signal_note,
        stop_hint=analysis.stop_hint,
        as_of=analysis.as_of,
        marks=[
            MarkOut(
                mark_date=m.mark_date.isoformat(),
                column_side=m.column_side,
                price=m.price,
                label=m.label,
                note=m.note,
            )
            for m in marks
        ],
    )


@router.get("/analyses", response_model=list[AnalysisOut])
async def list_analyses(
    timeframe: Timeframe = Timeframe.DAY,
    signal: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[AnalysisOut]:
    q = (
        select(VnsAnalysis)
        .options(selectinload(VnsAnalysis.instrument))
        .where(VnsAnalysis.timeframe == timeframe)
        .order_by(VnsAnalysis.updated_at.desc())
    )
    rows = list((await db.execute(q)).scalars().all())
    out: list[AnalysisOut] = []
    for a in rows:
        if signal and a.signal.value != signal:
            continue
        out.append(
            AnalysisOut(
                instrument=InstrumentOut.model_validate(a.instrument),
                timeframe=a.timeframe,
                trend=a.trend,
                last_bu=a.last_bu,
                last_be=a.last_be,
                last_r=a.last_r,
                last_dt=a.last_dt,
                last_db=a.last_db,
                signal=a.signal,
                signal_note=a.signal_note,
                stop_hint=a.stop_hint,
                as_of=a.as_of,
                marks=[],
            )
        )
    return out


@router.post("/admin/seed-nifty50")
async def admin_seed(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    if not user.is_admin:
        # Allow first bootstrap without admin flag for MVP
        count = await db.scalar(select(Instrument.id).limit(1))
        if count is not None and not user.is_admin:
            raise HTTPException(status_code=403, detail="Admin only")
    created = await seed_nifty50(db)
    return {"created": created}


@router.post("/admin/sync")
async def admin_sync(
    payload: SyncRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    _ = user
    tfs = payload.timeframes
    if not tfs:
        if payload.all_timeframes or payload.timeframe is None:
            tfs = None  # sync service defaults to ALL_TIMEFRAMES
        else:
            tfs = [payload.timeframe]
    return await sync_all_nifty50(
        db,
        timeframe=payload.timeframe,
        days_back=payload.days_back,
        symbol=payload.symbol,
        timeframes=tfs,
    )
