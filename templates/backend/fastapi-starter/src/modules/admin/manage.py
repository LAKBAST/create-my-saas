"""Operator-only CLI: python -m src.modules.admin.manage grant|revoke <uuid>."""
import argparse
import asyncio
import json
from uuid import UUID

from src.db.base import utc_now
from src.db.database import SessionLocal, close_database
from src.modules.admin.service import set_platform_admin


async def run(operation: str, user_id: UUID):
    try:
        async with SessionLocal() as db:
            await set_platform_admin(db, operation, user_id)
        print(json.dumps({"event": f"platform_admin.{operation}", "userId": str(user_id), "at": utc_now().isoformat()}))
    finally:
        await close_database()


def main():
    parser = argparse.ArgumentParser(description="Manage global read-only administrator access.")
    parser.add_argument("operation", choices=["grant", "revoke"])
    parser.add_argument("user_id", type=UUID)
    args = parser.parse_args()
    try:
        asyncio.run(run(args.operation, args.user_id))
    except ValueError as error:
        parser.exit(1, f"{error}\n")
    except Exception:
        parser.exit(1, "Administrator command failed; check database configuration and migrations.\n")


if __name__ == "__main__":
    main()
