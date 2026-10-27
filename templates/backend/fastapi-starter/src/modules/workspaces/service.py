from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import uuid4

from src.core.config import settings
from src.core.exceptions import AppError
from src.modules.users.model import Membership, MembershipRole, Organization, User


async def ensure_personal_workspace(user: User, db: AsyncSession, *, commit: bool = True) -> Organization | None:
    if settings.product_model == "teams":
        return None
    # Serialize concurrent bootstraps on the existing user row. The unique owner
    # constraint is the final invariant; a user can never receive two spaces.
    locked_user = (await db.execute(select(User).where(User.id == user.id).with_for_update())).scalar_one_or_none()
    if not locked_user or not locked_user.is_active:
        raise AppError("The user account is inactive.", code="USER_INACTIVE", status_code=403)
    workspace = (await db.execute(select(Organization).where(Organization.personal_owner_user_id == user.id))).scalar_one_or_none()
    if workspace is None:
        slug = f"personal-{user.id}"
        # Before product models existed teams could choose this now-reserved
        # prefix. Preserve those teams and pick another private identifier.
        while await db.scalar(select(Organization.id).where(Organization.slug == slug)) is not None:
            slug = f"personal-{uuid4()}"
        workspace = Organization(name="Personal", slug=slug, created_by_id=user.id, personal_owner_user_id=user.id)
        db.add(workspace)
        await db.flush()
        db.add(Membership(organization_id=workspace.id, user_id=user.id, role=MembershipRole.OWNER.value))
    if commit:
        await db.commit()
    return workspace


def public_workspace(workspace: Organization) -> dict:
    return {"id": str(workspace.id), "name": workspace.name, "slug": workspace.slug}


async def bootstrap(user: User, db: AsyncSession) -> dict:
    personal = await ensure_personal_workspace(user, db)
    teams = []
    if settings.product_model != "individual":
        teams = (await db.execute(select(Organization).join(Membership)
            .where(Membership.user_id == user.id, Organization.personal_owner_user_id.is_(None))
            .order_by(Organization.created_at, Organization.id))).scalars().all()
    return {"model": settings.product_model, "personalWorkspace": public_workspace(personal) if personal else None,
            "teams": [public_workspace(team) for team in teams], "billingSupported": True}
