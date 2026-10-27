from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import AppError
from src.core.config import settings
from src.modules.users.model import Membership, MembershipRole, Organization, User


async def membership_for(org_id: UUID, user: User, db: AsyncSession, *, team_only: bool = False) -> Membership:
    if team_only and settings.product_model == "individual":
        raise AppError("Teams are disabled for this product.", code="TEAMS_DISABLED", status_code=403)
    conditions = [or_(Organization.personal_owner_user_id.is_(None), Organization.personal_owner_user_id == user.id)]
    if settings.product_model == "individual":
        conditions.append(Organization.personal_owner_user_id == user.id)
    if team_only:
        conditions.append(Organization.personal_owner_user_id.is_(None))
    membership = (
        await db.execute(
            select(Membership).join(Organization).where(
                Membership.organization_id == org_id,
                Membership.user_id == user.id,
                *conditions,
            )
        )
    ).scalar_one_or_none()
    if not membership:
        raise AppError(
            "Organization membership is required.",
            code="MEMBERSHIP_REQUIRED",
            status_code=403,
        )
    return membership


async def require_role(
    org_id: UUID,
    user: User,
    db: AsyncSession,
    allowed: set[MembershipRole],
    *,
    team_only: bool = False,
) -> Membership:
    membership = await membership_for(org_id, user, db, team_only=team_only)
    if MembershipRole(membership.role) not in allowed:
        raise AppError(
            "This organization role cannot perform that action.",
            code="INSUFFICIENT_ROLE",
            status_code=403,
        )
    return membership


async def lock_organization(org_id: UUID, db: AsyncSession) -> Organization:
    if settings.product_model == "individual":
        raise AppError("Teams are disabled for this product.", code="TEAMS_DISABLED", status_code=403)
    organization = (
        await db.execute(
            select(Organization)
            .where(Organization.id == org_id, Organization.personal_owner_user_id.is_(None))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if not organization:
        raise AppError(
            "Organization membership is required.",
            code="MEMBERSHIP_REQUIRED",
            status_code=403,
        )
    return organization
