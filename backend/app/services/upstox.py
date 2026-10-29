from __future__ import annotations

from datetime import date
from typing import Any, Optional
from urllib.parse import quote

import httpx

from app.config import get_settings

# Our app timeframe value → Upstox v3 (unit, interval)
INTERVAL_TO_V3: dict[str, tuple[str, str]] = {
    "15minute": ("minutes", "15"),
    "30minute": ("minutes", "30"),
    "1hour": ("hours", "1"),
    "4hour": ("hours", "4"),
    "day": ("days", "1"),
    "week": ("weeks", "1"),
    "month": ("months", "1"),
}


class UpstoxError(Exception):
    pass


class UpstoxClient:
    def __init__(self, access_token: Optional[str] = None) -> None:
        settings = get_settings()
        self.base_url = settings.upstox_base_url.rstrip("/")
        self.access_token = access_token or settings.upstox_access_token
        self.api_key = settings.upstox_api_key

    def _api_root(self) -> str:
        base = self.base_url
        for suffix in ("/v2", "/v3"):
            if base.endswith(suffix):
                return base[: -len(suffix)]
        return base

    def _headers(self) -> dict[str, str]:
        if not self.access_token:
            raise UpstoxError("UPSTOX_ACCESS_TOKEN is not configured")
        return {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.access_token}",
        }

    @staticmethod
    def _v3_unit_interval(interval: str) -> tuple[str, str]:
        mapped = INTERVAL_TO_V3.get(interval)
        if not mapped:
            raise UpstoxError(f"Unsupported candle interval: {interval}")
        return mapped

    @staticmethod
    def _extract_candles(payload: dict[str, Any]) -> list[list[Any]]:
        candles = (
            payload.get("data", {}).get("candles")
            if isinstance(payload.get("data"), dict)
            else None
        )
        return candles or []

    async def get_historical_candles(
        self,
        instrument_key: str,
        interval: str,
        to_date: date,
        from_date: Optional[date] = None,
    ) -> list[list[Any]]:
        """
        Returns Upstox candle rows:
        [timestamp, open, high, low, close, volume, oi]
        Uses Historical Candle Data API v3 (supports 15m / 1h / 4h).
        """
        key = quote(instrument_key, safe="")
        unit, step = self._v3_unit_interval(interval)
        if from_date:
            path = f"/v3/historical-candle/{key}/{unit}/{step}/{to_date.isoformat()}/{from_date.isoformat()}"
        else:
            path = f"/v3/historical-candle/{key}/{unit}/{step}/{to_date.isoformat()}"

        url = f"{self._api_root()}{path}"
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(url, headers=self._headers())
            if resp.status_code >= 400:
                raise UpstoxError(f"Upstox historical error {resp.status_code}: {resp.text}")
            return self._extract_candles(resp.json())

    async def get_intraday_candles(
        self,
        instrument_key: str,
        interval: str,
    ) -> list[list[Any]]:
        """Today's session candles (not in historical until day completes)."""
        key = quote(instrument_key, safe="")
        unit, step = self._v3_unit_interval(interval)
        url = f"{self._api_root()}/v3/historical-candle/intraday/{key}/{unit}/{step}"
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(url, headers=self._headers())
            if resp.status_code >= 400:
                raise UpstoxError(f"Upstox intraday error {resp.status_code}: {resp.text}")
            return self._extract_candles(resp.json())

    async def get_ltp(self, instrument_keys: list[str]) -> dict[str, Any]:
        # LTP remains on v2
        root = self._api_root()
        url = f"{root}/v2/market-quote/ltp"
        params = {"instrument_key": ",".join(instrument_keys)}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers=self._headers(), params=params)
            if resp.status_code >= 400:
                raise UpstoxError(f"Upstox LTP error {resp.status_code}: {resp.text}")
            return resp.json().get("data", {})
