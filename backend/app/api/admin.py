from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, hash_password
from app.db import get_db
from app.models import PackageTier, User
from app.schemas import UserOut

router = APIRouter(prefix="/admin", tags=["admin"])


async def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user


class AdminUserOut(UserOut):
    is_active: bool
    package_expires_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = ""
    package: PackageTier = PackageTier.TRIAL
    is_admin: bool = False
    trial_days: int = 14


class AdminUserUpdate(BaseModel):
    full_name: Optional[str] = None
    package: Optional[PackageTier] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None
    package_expires_at: Optional[datetime] = None
    extend_days: Optional[int] = None
    password: Optional[str] = Field(default=None, min_length=8)


def _to_out(user: User) -> AdminUserOut:
    return AdminUserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        package=user.package,
        is_admin=user.is_admin,
        is_active=user.is_active,
        package_expires_at=user.package_expires_at,
        created_at=user.created_at,
    )


@router.get("/users", response_model=list[AdminUserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[AdminUserOut]:
    result = await db.execute(select(User).order_by(User.id.asc()))
    return [_to_out(u) for u in result.scalars().all()]


@router.post("/users", response_model=AdminUserOut)
async def create_user(
    payload: AdminUserCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> AdminUserOut:
    existing = await db.execute(select(User).where(User.email == payload.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        package=payload.package,
        is_admin=payload.is_admin,
        is_active=True,
        package_expires_at=datetime.now(timezone.utc) + timedelta(days=payload.trial_days),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _to_out(user)


@router.patch("/users/{user_id}", response_model=AdminUserOut)
async def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminUserOut:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.package is not None:
        user.package = payload.package
    if payload.is_active is not None:
        if user.id == admin.id and payload.is_active is False:
            raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
        user.is_active = payload.is_active
    if payload.is_admin is not None:
        if user.id == admin.id and payload.is_admin is False:
            raise HTTPException(status_code=400, detail="Cannot remove your own admin flag")
        user.is_admin = payload.is_admin
    if payload.package_expires_at is not None:
        user.package_expires_at = payload.package_expires_at
    if payload.extend_days is not None:
        base = user.package_expires_at or datetime.now(timezone.utc)
        if base.tzinfo is None:
            base = base.replace(tzinfo=timezone.utc)
        if base < datetime.now(timezone.utc):
            base = datetime.now(timezone.utc)
        user.package_expires_at = base + timedelta(days=payload.extend_days)
    if payload.password:
        user.hashed_password = hash_password(payload.password)

    await db.commit()
    await db.refresh(user)
    return _to_out(user)
