from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api import admin, auth, market
from app.config import get_settings
from app.db import Base, SessionLocal, engine
from app.models import User
from app.auth import hash_password
from app.services.sync import seed_nifty50


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        await seed_nifty50(db)
        existing = await db.execute(select(User).where(User.email.in_(["admin@vns.app", "admin@vns.local"])))
        admin = existing.scalar_one_or_none()
        if not admin:
            db.add(
                User(
                    email="admin@vns.app",
                    full_name="VNS Admin",
                    hashed_password=hash_password("admin12345"),
                    is_admin=True,
                )
            )
            await db.commit()
        elif admin.email == "admin@vns.local":
            admin.email = "admin@vns.app"
            await db.commit()
    yield


settings = get_settings()
app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(market.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "app": settings.app_name}
