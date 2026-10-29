from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from app.models import MarkLabel, PackageTier, SignalType, Timeframe


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = ""


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    package: PackageTier
    is_admin: bool

    class Config:
        from_attributes = True


class InstrumentOut(BaseModel):
    id: int
    symbol: str
    name: str
    exchange: str = "NSE"
    segment: str = "EQ"
    trading_symbol: str = ""
    instrument_key: str
    tick_size: float
    tolerance_abs: float
    tolerance_pct: float
    is_nifty50: bool
    last_synced_at: Optional[datetime]

    class Config:
        from_attributes = True


class InstrumentSearchHit(BaseModel):
    exchange: str
    segment: str
    symbol: str
    trading_symbol: str
    name: str
    isin: str
    instrument_key: str
    tick_size: float
    instrument_type: str
    in_library: bool = False


class OpenInstrumentRequest(BaseModel):
    instrument_key: str
    sync: bool = True
    all_timeframes: bool = True


class OpenInstrumentResponse(BaseModel):
    instrument: InstrumentOut
    added_to_watchlist: bool = True
    sync: Optional[dict] = None


class CandleOut(BaseModel):
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


class MarkOut(BaseModel):
    mark_date: datetime | str
    column_side: str
    price: float
    label: MarkLabel
    note: str = ""

    class Config:
        from_attributes = True


class AnalysisOut(BaseModel):
    instrument: InstrumentOut
    timeframe: Timeframe
    trend: str
    last_bu: Optional[float]
    last_be: Optional[float]
    last_r: Optional[float]
    last_dt: Optional[float]
    last_db: Optional[float]
    signal: SignalType
    signal_note: str
    stop_hint: Optional[float]
    as_of: Optional[datetime]
    marks: list[MarkOut] = []

    class Config:
        from_attributes = True


class SyncRequest(BaseModel):
    timeframe: Optional[Timeframe] = None
    timeframes: Optional[list[Timeframe]] = None
    all_timeframes: bool = True
    days_back: Optional[int] = None
    symbol: Optional[str] = None
