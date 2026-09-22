import asyncio
import logging

from app.config import get_settings
from app.db import Base, SessionLocal, engine
from app.services.sync import ALL_TIMEFRAMES, seed_nifty50, sync_all_nifty50

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vns.worker")


async def ensure_schema() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        await seed_nifty50(db)


async def loop() -> None:
    settings = get_settings()
    interval = max(60, settings.ohlc_sync_interval_minutes * 60)
    await ensure_schema()
    while True:
        try:
            async with SessionLocal() as db:
                result = await sync_all_nifty50(
                    db,
                    timeframes=ALL_TIMEFRAMES,
                )
                logger.info(
                    "sync done instruments=%s synced=%s analyzed=%s candles=%s errors=%s",
                    result.get("instruments"),
                    result.get("synced"),
                    result.get("analyzed"),
                    result.get("candle_rows"),
                    len(result.get("errors") or []),
                )
                if result.get("errors"):
                    for err in result["errors"][:10]:
                        logger.warning("sync error: %s", err)
        except Exception:  # noqa: BLE001
            logger.exception("sync failed")
        await asyncio.sleep(interval)


if __name__ == "__main__":
    asyncio.run(loop())
