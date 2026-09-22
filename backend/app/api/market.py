from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.db import get_db
from app.models import Candle, Instrument, Timeframe, User, VnsAnalysis, VnsMark
from app.schemas import AnalysisOut, CandleOut, InstrumentOut, MarkOut, SyncRequest
from app.services.sync import seed_nifty50, sync_all_nifty50

router = APIRouter(tags=["market"])


@router.get("/instruments", response_model=list[InstrumentOut])
async def list_instruments(
    nifty50_only: bool = True,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Instrument]:
    q = select(Instrument).where(Instrument.is_active.is_(True)).order_by(Instrument.symbol)
    if nifty50_only:
        q = q.where(Instrument.is_nifty50.is_(True))
    result = await db.execute(q)
    return list(result.scalars().all())


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
