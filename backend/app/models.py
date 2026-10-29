from datetime import date, datetime
from enum import Enum
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class PackageTier(str, Enum):
    TRIAL = "trial"
    BASIC = "basic"
    PRO = "pro"
    PREMIUM = "premium"


class Timeframe(str, Enum):
    # Kept for existing DB rows; not synced or shown in UI
    MINUTE_1 = "1minute"
    MINUTE_15 = "15minute"
    MINUTE_30 = "30minute"
    HOUR_1 = "1hour"
    HOUR_4 = "4hour"
    DAY = "day"
    WEEK = "week"
    MONTH = "month"


class MarkLabel(str, Enum):
    BU = "BU"
    BE = "BE"
    R = "R"
    DT = "DT"
    DB = "DB"


class SignalType(str, Enum):
    BREAKOUT_LONG = "breakout_long"
    BREAKDOWN_SHORT = "breakdown_short"
    DT_SHORT = "dt_short"
    DB_LONG = "db_long"
    SIDEWAYS = "sideways"
    NONE = "none"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255), default="")
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    package: Mapped[PackageTier] = mapped_column(
        SAEnum(PackageTier, name="package_tier"), default=PackageTier.TRIAL
    )
    package_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    watchlist_items: Mapped[list["WatchlistItem"]] = relationship(back_populates="user")


class Instrument(Base):
    __tablename__ = "instruments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    exchange: Mapped[str] = mapped_column(String(32), default="NSE")
    segment: Mapped[str] = mapped_column(String(32), default="EQ")
    isin: Mapped[str] = mapped_column(String(32), default="")
    trading_symbol: Mapped[str] = mapped_column(String(64))
    instrument_key: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    tick_size: Mapped[float] = mapped_column(Float, default=0.05)
    tolerance_abs: Mapped[float] = mapped_column(Float, default=1.0)
    tolerance_pct: Mapped[float] = mapped_column(Float, default=0.15)
    is_nifty50: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    candles: Mapped[list["Candle"]] = relationship(back_populates="instrument")
    marks: Mapped[list["VnsMark"]] = relationship(back_populates="instrument")
    analyses: Mapped[list["VnsAnalysis"]] = relationship(back_populates="instrument")


class Candle(Base):
    __tablename__ = "candles"
    __table_args__ = (
        UniqueConstraint(
            "instrument_id", "timeframe", "ts", name="uq_candle_instrument_tf_ts"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id"), index=True)
    timeframe: Mapped[Timeframe] = mapped_column(SAEnum(Timeframe, name="timeframe"))
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    open: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    volume: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    instrument: Mapped["Instrument"] = relationship(back_populates="candles")


class VnsMark(Base):
    __tablename__ = "vns_marks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id"), index=True)
    timeframe: Mapped[Timeframe] = mapped_column(SAEnum(Timeframe, name="timeframe"))
    mark_date: Mapped[date] = mapped_column(Date, index=True)
    column_side: Mapped[str] = mapped_column(String(8))  # BU or BE side
    price: Mapped[float] = mapped_column(Float)
    label: Mapped[MarkLabel] = mapped_column(SAEnum(MarkLabel, name="mark_label"))
    ref_high: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ref_low: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    instrument: Mapped["Instrument"] = relationship(back_populates="marks")


class VnsAnalysis(Base):
    __tablename__ = "vns_analyses"
    __table_args__ = (
        UniqueConstraint(
            "instrument_id", "timeframe", name="uq_analysis_instrument_tf"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id"), index=True)
    timeframe: Mapped[Timeframe] = mapped_column(SAEnum(Timeframe, name="timeframe"))
    trend: Mapped[str] = mapped_column(String(32), default="unknown")
    last_bu: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_be: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_r: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_dt: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_db: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    signal: Mapped[SignalType] = mapped_column(
        SAEnum(SignalType, name="signal_type"), default=SignalType.NONE
    )
    signal_note: Mapped[str] = mapped_column(Text, default="")
    stop_hint: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    as_of: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    instrument: Mapped["Instrument"] = relationship(back_populates="analyses")


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"
    __table_args__ = (UniqueConstraint("user_id", "instrument_id", name="uq_watchlist_user_instrument"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="watchlist_items")
