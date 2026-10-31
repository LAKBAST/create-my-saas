import asyncio
import unittest
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from sqlalchemy.dialects import postgresql

from src.modules.organizations import invitations
from src.modules.organizations.schemas import AcceptInvite, InviteCreate
from src.modules.users.model import AuditLog, MembershipRole


class Result:
    def __init__(self, value=None):
        self.value = value

    def scalar_one_or_none(self):
        return self.value

    def scalar_one(self):
        return self.value

    def one_or_none(self):
        return self.value


class RecordingSession:
    def __init__(self, results):
        self.results = iter(results)
        self.statements = []
        self.commits = 0
        self.rollbacks = 0
        self.added = []

    async def execute(self, statement):
        self.statements.append(statement)
        return Result(next(self.results))

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1

    def add(self, value):
        self.added.append(value)


class OrganizationInvitationTests(unittest.TestCase):
    def setUp(self):
        # Generated projects may install invitation hooks. These statement-level
        # tests exercise the Community path without extension queries.
        hooks = patch.object(invitations, "EXTENSION_INVITATION_HOOKS", [])
        hooks.start()
        self.addCleanup(hooks.stop)

    def test_creating_an_invitation_uses_the_active_invitation_unique_index(self):
        invitation_id = uuid4()
        session = RecordingSession([invitation_id, None])
        user = SimpleNamespace(id=uuid4())
        payload = InviteCreate(email="member@example.com", role=MembershipRole.MEMBER)

        with (
            patch.object(invitations, "require_role", new=AsyncMock()),
            patch.object(invitations, "opaque_token", return_value="raw-token"),
            patch.object(invitations, "send_secure_email", new=AsyncMock()) as deliver,
        ):
            response = asyncio.run(invitations.invite(uuid4(), payload, user, session))

        statement = str(session.statements[0].compile(dialect=postgresql.dialect()))
        self.assertIn("ON CONFLICT (organization_id, email) WHERE accepted_at IS NULL AND cancelled_at IS NULL DO NOTHING", statement)
        self.assertEqual(response, {"id": str(invitation_id), "accepted": False})
        self.assertEqual(session.commits, 2)
        self.assertEqual([(event.action, event.target_id, event.metadata_) for event in session.added if isinstance(event, AuditLog)], [
            ("organization.invitation.created", str(invitation_id), {"email": "member@example.com", "role": "member"}),
        ])
        self.assertNotIn("raw-token", repr(session.added))
        deliver.assert_awaited_once()

    def test_failed_delivery_can_retry_with_a_rotated_token_without_a_second_invitation(self):
        invitation_id = uuid4()
        organization_id = uuid4()
        user = SimpleNamespace(id=uuid4())
        payload = InviteCreate(email="member@example.com", role=MembershipRole.MEMBER)
        first = RecordingSession([invitation_id])
        pending = SimpleNamespace(
            id=invitation_id,
            expires_at=invitations.utc_now() + timedelta(days=1),
            delivered_at=None,
        )
        retry = RecordingSession([None, pending, None])

        with (
            patch.object(invitations, "require_role", new=AsyncMock()),
            patch.object(invitations, "opaque_token", side_effect=["first-token", "second-token"]),
            patch.object(invitations, "send_secure_email", new=AsyncMock(side_effect=[RuntimeError("mail unavailable"), None])) as deliver,
        ):
            with self.assertRaisesRegex(RuntimeError, "mail unavailable"):
                asyncio.run(invitations.invite(organization_id, payload, user, first))
            response = asyncio.run(invitations.invite(organization_id, payload, user, retry))

        self.assertEqual(response["id"], str(invitation_id))
        self.assertEqual(first.commits, 1)
        self.assertEqual(retry.commits, 2)
        self.assertEqual(pending.token_hash, invitations.token_hash("second-token"))
        self.assertNotEqual(pending.token_hash, invitations.token_hash("first-token"))
        self.assertIn("second-token", deliver.await_args_list[1].kwargs["body"])
        self.assertNotIn("second-token", repr(retry.added))

    def test_delivered_invitation_remains_idempotent(self):
        invitation_id = uuid4()
        delivered = SimpleNamespace(
            id=invitation_id,
            expires_at=invitations.utc_now() + timedelta(days=1),
            delivered_at=invitations.utc_now(),
        )
        session = RecordingSession([None, delivered])
        with (
            patch.object(invitations, "require_role", new=AsyncMock()),
            patch.object(invitations, "send_secure_email", new=AsyncMock()) as deliver,
        ):
            response = asyncio.run(invitations.invite(
                uuid4(), InviteCreate(email="member@example.com", role=MembershipRole.MEMBER),
                SimpleNamespace(id=uuid4()), session,
            ))

        self.assertEqual(response["id"], str(invitation_id))
        self.assertEqual(session.commits, 1)
        self.assertEqual(len(session.statements), 2)
        deliver.assert_not_awaited()

    def test_accepting_an_invitation_claims_it_and_upserts_membership(self):
        organization_id = uuid4()
        invitation_id = uuid4()
        session = RecordingSession([SimpleNamespace(id=invitation_id, organization_id=organization_id, role="member"), None])
        user = SimpleNamespace(id=uuid4(), email="member@example.com")

        asyncio.run(invitations.accept_invitation(AcceptInvite(token="raw-token"), user, session))

        claim = str(session.statements[0].compile(dialect=postgresql.dialect()))
        membership = str(session.statements[1].compile(dialect=postgresql.dialect()))
        self.assertIn("accepted_at IS NULL", claim)
        self.assertIn("cancelled_at IS NULL", claim)
        self.assertIn("RETURNING invitations.id, invitations.organization_id, invitations.role", claim)
        self.assertIn("ON CONFLICT (organization_id, user_id) DO NOTHING", membership)
        self.assertEqual(session.commits, 1)
        self.assertEqual([(event.action, event.target_id) for event in session.added if isinstance(event, AuditLog)], [
            ("organization.invitation.accepted", str(invitation_id)),
        ])

    def test_reaccepting_a_completed_invitation_is_a_noop_for_the_same_email(self):
        now = invitations.utc_now()
        session = RecordingSession([None, SimpleNamespace(accepted_at=now, email="member@example.com")])
        user = SimpleNamespace(id=uuid4(), email="member@example.com")

        asyncio.run(invitations.accept_invitation(AcceptInvite(token="raw-token"), user, session))

        self.assertEqual(len(session.statements), 2)
        self.assertEqual(session.commits, 0)

    def test_migration_enforces_one_active_invitation_without_losing_history(self):
        migration = (
            __import__("pathlib").Path(__file__).parents[1]
            / "alembic/versions/20260912_0003_atomic_invitations.py"
        ).read_text(encoding="utf-8")

        self.assertIn("cancelled_at", migration)
        self.assertIn("uq_invitations_active_org_email", migration)
        self.assertIn("accepted_at IS NULL AND cancelled_at IS NULL", migration)
