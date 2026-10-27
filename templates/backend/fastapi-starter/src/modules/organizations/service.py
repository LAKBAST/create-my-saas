from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import AppError
from src.core.config import settings
from src.modules.organizations.schemas import OrganizationCreate
from src.modules.users.model import Membership, MembershipRole, Organization, User


async def create_organization(
    payload: OrganizationCreate,
    user: User,
    db: AsyncSession,
) -> Organization:
    if settings.product_model == "individual":
        raise AppError("Teams are disabled for this product.", code="TEAMS_DISABLED", status_code=403)
    if payload.slug.startswith("personal-"):
        raise AppError("This slug prefix is reserved for personal workspaces.", code="INVALID_ORGANIZATION_SLUG", status_code=400)
    existing = (
        await db.execute(select(Organization).where(Organization.slug == payload.slug))
    ).scalar_one_or_none()
    if existing:
        raise AppError(
            "Organization slug is already in use.",
            code="SLUG_ALREADY_EXISTS",
            status_code=409,
        )
    organization = Organization(
        name=payload.name,
        slug=payload.slug,
        created_by_id=user.id,
    )
    db.add(organization)
    await db.flush()
    db.add(
        Membership(
            organization_id=organization.id,
            user_id=user.id,
            role=MembershipRole.OWNER.value,
        )
    )
    await db.commit()
    await db.refresh(organization)
    return organization


async def list_organizations(user: User, db: AsyncSession):
    conditions = [Membership.user_id == user.id]
    if settings.product_model == "individual":
        conditions.append(Organization.personal_owner_user_id == user.id)
    else:
        from sqlalchemy import or_
        conditions.append(or_(Organization.personal_owner_user_id.is_(None), Organization.personal_owner_user_id == user.id))
    return (
        await db.execute(
            select(Organization)
            .join(Membership)
            .where(*conditions)
        )
    ).scalars().all()
