from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.database import get_db
from src.modules.auth.router import require_csrf
from src.modules.auth.security.tokens import get_current_user
from src.modules.users.model import User
from src.modules.workspaces.service import bootstrap

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.post("/bootstrap", dependencies=[Depends(require_csrf)])
async def bootstrap_workspace(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await bootstrap(user, db)
