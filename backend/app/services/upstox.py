from __future__ import annotations

from datetime import date
from typing import Any, Optional
from urllib.parse import quote

import httpx

from app.config import get_settings


class UpstoxError(Exception):
    pass


class UpstoxClient:
    def __init__(self, access_token: Optional[str] = None) -> None:
        settings = get_settings()
        self.base_url = settings.upstox_base_url.rstrip("/")
        self.access_token = access_token or settings.upstox_access_token
        self.api_key = settings.upstox_api_key

    def _headers(self) -> dict[str, str]:
        if not self.access_token:
            raise UpstoxError("UPSTOX_ACCESS_TOKEN is not configured")
        return {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.access_token}",
        }

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
        """
        key = quote(instrument_key, safe="")
        if from_date:
            path = f"/historical-candle/{key}/{interval}/{to_date.isoformat()}/{from_date.isoformat()}"
        else:
            path = f"/historical-candle/{key}/{interval}/{to_date.isoformat()}"

        url = f"{self.base_url}{path}"
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(url, headers=self._headers())
            if resp.status_code >= 400:
                raise UpstoxError(f"Upstox historical error {resp.status_code}: {resp.text}")
            payload = resp.json()
            candles = (
                payload.get("data", {}).get("candles")
                if isinstance(payload.get("data"), dict)
                else None
            )
            return candles or []

    async def get_intraday_candles(
        self,
        instrument_key: str,
        interval: str,
    ) -> list[list[Any]]:
        """Today's session candles (not in historical until day completes)."""
        key = quote(instrument_key, safe="")
        url = f"{self.base_url}/historical-candle/intraday/{key}/{interval}"
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(url, headers=self._headers())
            if resp.status_code >= 400:
                raise UpstoxError(f"Upstox intraday error {resp.status_code}: {resp.text}")
            payload = resp.json()
            candles = (
                payload.get("data", {}).get("candles")
                if isinstance(payload.get("data"), dict)
                else None
            )
            return candles or []

    async def get_ltp(self, instrument_keys: list[str]) -> dict[str, Any]:
        url = f"{self.base_url}/market-quote/ltp"
        params = {"instrument_key": ",".join(instrument_keys)}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers=self._headers(), params=params)
            if resp.status_code >= 400:
                raise UpstoxError(f"Upstox LTP error {resp.status_code}: {resp.text}")
            return resp.json().get("data", {})
