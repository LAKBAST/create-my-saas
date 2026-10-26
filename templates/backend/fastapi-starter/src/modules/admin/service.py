from datetime import timedelta
from uuid import UUID

from sqlalchemy import func, or_, select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import AppError
from src.db.base import utc_now
from src.modules.users.model import Membership, Organization, PlatformAdmin, Subscription, User

RESOURCES = ["users", "organizations", "subscriptions"]


async def has_access(db: AsyncSession, user: User) -> bool:
    return bool(user.is_active and user.email_verified and await db.get(PlatformAdmin, user.id))


async def set_platform_admin(db: AsyncSession, operation: str, user_id: UUID) -> None:
    if operation not in {"grant", "revoke"}:
        raise ValueError("Operation must be grant or revoke.")
    result = await db.execute(select(User).where(User.id == user_id).with_for_update())
    user = result.scalar_one_or_none()
    if user is None:
        raise ValueError("User not found.")
    if operation == "grant":
        if not user.is_active or not user.email_verified:
            raise ValueError("Only active users with verified email can receive platform access.")
        if await db.get(PlatformAdmin, user.id) is None:
            db.add(PlatformAdmin(user_id=user.id))
    else:
        await db.execute(delete(PlatformAdmin).where(PlatformAdmin.user_id == user.id))
    await db.commit()


def search_condition(fields, search):
    text = search.strip().lower() if search else ""
    if not text:
        return True
    pattern = "%" + text.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%"
    return or_(*(func.lower(field).like(pattern, escape="!") for field in fields))


async def overview(db: AsyncSession, days: int):
    since = utc_now() - timedelta(days=days)

    async def count(model, *conditions):
        return int(await db.scalar(select(func.count()).select_from(model).where(*conditions)) or 0)

    # AsyncSession is not concurrency safe; execute its queries sequentially.
    result = {
        "periodDays": days,
        "totalUsers": await count(User),
        "enabledUsers": await count(User, User.is_active.is_(True)),
        "verifiedUsers": await count(User, User.email_verified.is_(True)),
        "newUsers": await count(User, User.created_at >= since),
        "totalOrganizations": await count(Organization),
        "newOrganizations": await count(Organization, Organization.created_at >= since),
        "totalSubscriptions": await count(Subscription),
    }
    statuses = await db.execute(select(Subscription.status, func.count()).group_by(Subscription.status).order_by(Subscription.status))
    plans = await db.execute(select(Subscription.plan, func.count()).group_by(Subscription.plan).order_by(Subscription.plan))
    result["subscriptionsByStatus"] = [{"status": status, "count": count} for status, count in statuses.all()]
    result["subscriptionsByPlan"] = [{"plan": plan, "count": count} for plan, count in plans.all()]
    return result


async def list_resource(db: AsyncSession, resource: str, page: int, page_size: int, search: str | None):
    if resource == "users":
        model, fields = User, [User.email, User.name]
        query = select(User)
        ordering = [User.created_at.desc(), User.id.desc()]
    elif resource == "organizations":
        model, fields = Organization, [Organization.name, Organization.slug]
        members = select(func.count()).select_from(Membership).where(Membership.organization_id == Organization.id).correlate(Organization).scalar_subquery()
        query = select(Organization, members)
        ordering = [Organization.created_at.desc(), Organization.id.desc()]
    elif resource == "subscriptions":
        model, fields = Subscription, [Organization.name, Organization.slug, Subscription.plan, Subscription.status]
        query = select(Subscription, Organization.name).join(Organization, Organization.id == Subscription.organization_id)
        # FastAPI stores updated_at, rather than NestJS's subscription created_at.
        ordering = [Subscription.updated_at.desc(), Subscription.id.desc()]
    else:
        raise AppError(code="ADMIN_RESOURCE_NOT_FOUND", status_code=404)
    condition = search_condition(fields, search)
    count_query = select(func.count()).select_from(model)
    if resource == "subscriptions":
        count_query = count_query.join(Organization, Organization.id == Subscription.organization_id)
    total = int(await db.scalar(count_query.where(condition)) or 0)
    rows = (await db.execute(query.where(condition).order_by(*ordering).offset((page - 1) * page_size).limit(page_size))).all()
    items = []
    for row in rows:
        record = row[0]
        if resource == "users":
            items.append({"id": str(record.id), "email": record.email, "name": record.name, "emailVerified": record.email_verified, "isActive": record.is_active, "createdAt": record.created_at})
        elif resource == "organizations":
            items.append({"id": str(record.id), "name": record.name, "slug": record.slug, "createdAt": record.created_at, "memberCount": row[1]})
        else:
            items.append({"id": str(record.id), "organizationId": str(record.organization_id), "organizationName": row[1], "provider": record.provider, "plan": record.plan, "status": record.status, "seats": record.seats, "cancelAtPeriodEnd": record.cancel_at_period_end, "currentPeriodStart": record.current_period_start, "currentPeriodEnd": record.current_period_end})
    return {"items": items, "total": total, "page": page, "pageSize": page_size}
