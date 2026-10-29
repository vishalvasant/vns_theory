from __future__ import annotations

import gzip
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import httpx

NSE_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"
BSE_URL = "https://assets.upstox.com/market-quote/instruments/exchange/BSE.json.gz"

NSE_EQ_TYPES = {"EQ", "BE", "SM", "ST", "BZ"}
BSE_EQ_TYPES = {"A", "B", "T", "X", "XT", "Z", "M", "MT", "TS", "P", "R", "E"}

CACHE_DIR = Path("/tmp/vns_cache")
CACHE_TTL_SEC = 12 * 60 * 60

_cache: list["MasterInstrument"] | None = None
_cache_loaded_at: float = 0.0


@dataclass(frozen=True)
class MasterInstrument:
    exchange: str
    segment: str
    instrument_key: str
    trading_symbol: str
    name: str
    isin: str
    tick_size: float
    instrument_type: str

    @property
    def symbol(self) -> str:
        """App-unique symbol. BSE uses .BSE suffix to avoid NSE collisions."""
        ts = self.trading_symbol.upper()
        if self.exchange.upper() == "BSE":
            return f"{ts}.BSE"
        return ts


def _normalize_tick(raw: float | int | None) -> float:
    try:
        tick = float(raw or 0.05)
    except (TypeError, ValueError):
        return 0.05
    # Upstox equity tick sizes are often in paise (e.g. 5.0 → ₹0.05)
    if tick >= 1:
        tick = tick / 100.0
    return tick if tick > 0 else 0.05


def _parse_rows(rows: Iterable[dict], exchange: str) -> list[MasterInstrument]:
    allowed = NSE_EQ_TYPES if exchange == "NSE" else BSE_EQ_TYPES
    segment = f"{exchange}_EQ"
    out: list[MasterInstrument] = []
    for row in rows:
        if row.get("segment") != segment:
            continue
        itype = str(row.get("instrument_type") or "")
        if itype not in allowed:
            continue
        isin = str(row.get("isin") or "")
        # Skip mutual-fund / debt ISINs (INF…) — equity ISINs are INE…
        if isin.startswith("INF"):
            continue
        key = str(row.get("instrument_key") or "")
        trading = str(row.get("trading_symbol") or "").strip()
        if not key or not trading:
            continue
        name = str(row.get("short_name") or row.get("name") or trading).strip()
        if "MUTUAL FUND" in name.upper():
            continue
        out.append(
            MasterInstrument(
                exchange=exchange,
                segment=segment,
                instrument_key=key,
                trading_symbol=trading.upper(),
                name=name,
                isin=isin,
                tick_size=_normalize_tick(row.get("tick_size")),
                instrument_type=itype,
            )
        )
    return out


async def _download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        dest.write_bytes(resp.content)


def _load_gz(path: Path) -> list[dict]:
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        data = json.load(fh)
    return data if isinstance(data, list) else []


async def ensure_master(force: bool = False) -> list[MasterInstrument]:
    global _cache, _cache_loaded_at
    now = time.time()
    if not force and _cache is not None and (now - _cache_loaded_at) < CACHE_TTL_SEC:
        return _cache

    nse_path = CACHE_DIR / "NSE.json.gz"
    bse_path = CACHE_DIR / "BSE.json.gz"
    need_nse = force or not nse_path.exists() or (now - nse_path.stat().st_mtime) > CACHE_TTL_SEC
    need_bse = force or not bse_path.exists() or (now - bse_path.stat().st_mtime) > CACHE_TTL_SEC
    if need_nse:
        await _download(NSE_URL, nse_path)
    if need_bse:
        await _download(BSE_URL, bse_path)

    instruments = _parse_rows(_load_gz(nse_path), "NSE") + _parse_rows(_load_gz(bse_path), "BSE")
    _cache = instruments
    _cache_loaded_at = now
    return instruments


async def search_instruments(
    query: str,
    *,
    exchange: str | None = None,
    limit: int = 25,
) -> list[MasterInstrument]:
    q = query.strip().upper()
    if len(q) < 1:
        return []
    rows = await ensure_master()
    ex = exchange.upper() if exchange else None
    scored: list[tuple[int, int, MasterInstrument]] = []
    for row in rows:
        if ex and row.exchange != ex:
            continue
        sym = row.trading_symbol
        name = row.name.upper()
        key = row.instrument_key.upper()
        isin = row.isin.upper()
        # Prefer NSE slightly when scores tie (exchange_rank 0 = NSE)
        ex_rank = 0 if row.exchange == "NSE" else 1
        if q == sym:
            score = 0
        elif sym.startswith(q):
            score = 1
        elif q in sym:
            score = 2
        elif name.startswith(q):
            score = 3
        elif q in name:
            score = 4
        elif q in isin or q in key:
            score = 5
        else:
            continue
        scored.append((score, ex_rank, row))
    scored.sort(key=lambda item: (item[0], item[1], item[2].trading_symbol))
    return [row for _, _, row in scored[: max(1, min(limit, 50))]]


async def find_by_instrument_key(instrument_key: str) -> MasterInstrument | None:
    key = instrument_key.strip()
    if not key:
        return None
    rows = await ensure_master()
    for row in rows:
        if row.instrument_key == key:
            return row
    return None
