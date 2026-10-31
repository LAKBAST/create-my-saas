"""Declarative extension integration points.

The generator replaces this file when a FastAPI extension declares integrations.
"""

EXTENSION_ROUTERS: list[str] = []
EXTENSION_SETTINGS: list[dict[str, str | int]] = []
EXTENSION_AUDIT_ACTIONS: dict[str, list[str]] = {}
EXTENSION_INVITATION_HOOKS: list[str] = []


def include_extension_routers(app) -> None:
    return None


def extension_value(name: str) -> str:
    raise KeyError(f"Unknown extension setting: {name}")


def validate_extension_settings() -> None:
    return None


async def run_invitation_hooks(action: str, db, organization_id, email: str, user_id) -> None:
    """Run extension checks in the invitation transaction after the organization lock."""
    return None
