from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import AppError
from src.db.database import get_db
from src.modules.auth.security.tokens import get_current_user
from src.modules.users.model import User
from src.modules.admin import service


class AdminListQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page: int = Field(default=1, ge=1, le=10000)
    pageSize: int = Field(default=25, ge=1, le=100)
    search: str | None = Field(default=None, max_length=120)


class AdminOverviewQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    days: int = Field(default=30, ge=1, le=365)


async def require_platform_admin(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not await service.has_access(db, user):
        raise AppError("Platform administrator access is required.", code="PLATFORM_ADMIN_REQUIRED", status_code=403)
    return user


router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/access")
async def access(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return {"allowed": await service.has_access(db, user), "resources": service.RESOURCES}


@router.get("/overview", dependencies=[Depends(require_platform_admin)])
async def overview(query: Annotated[AdminOverviewQuery, Query()], db: AsyncSession = Depends(get_db)):
    return await service.overview(db, query.days)


@router.get("/users", dependencies=[Depends(require_platform_admin)])
async def users(query: Annotated[AdminListQuery, Query()], db: AsyncSession = Depends(get_db)):
    return await service.list_resource(db, "users", query.page, query.pageSize, query.search)


@router.get("/organizations", dependencies=[Depends(require_platform_admin)])
async def organizations(query: Annotated[AdminListQuery, Query()], db: AsyncSession = Depends(get_db)):
    return await service.list_resource(db, "organizations", query.page, query.pageSize, query.search)


@router.get("/subscriptions", dependencies=[Depends(require_platform_admin)])
async def subscriptions(query: Annotated[AdminListQuery, Query()], db: AsyncSession = Depends(get_db)):
    return await service.list_resource(db, "subscriptions", query.page, query.pageSize, query.search)
