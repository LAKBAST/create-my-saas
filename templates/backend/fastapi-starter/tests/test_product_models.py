"""Workspace scope and registration contracts with real HTTP and SQL queries."""
import asyncio
import importlib.util
import unittest
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import UUID

from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, inspect, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from main import app
from src.core.config import Settings, settings
from src.core import middleware
from src.db.base import Base
from src.db.database import get_db
from src.modules.auth.dependencies import get_user_repository
from src.modules.auth.security.tokens import encode_access_token
from src.modules.auth.service import AuthService
from src.modules.organizations import access, invitations, service as organizations
from src.modules.users.model import Membership, Organization, Subscription, User
from src.modules.users.repository import UserRepository
from src.modules.workspaces import service as workspaces


class AsyncSqliteSession:
    def __init__(self, session):
        self.session = session

    async def execute(self, statement): return self.session.execute(statement)
    async def scalar(self, statement): return self.session.scalar(statement)
    async def get(self, model, key): return self.session.get(model, key)
    def add(self, value): self.session.add(value)
    async def flush(self): self.session.flush()
    async def commit(self): self.session.commit()
    async def rollback(self): self.session.rollback()
    async def refresh(self, value): self.session.refresh(value)


class SqliteUserRepository(UserRepository):
    async def get_user_by_id(self, key):
        return self.db.session.get(User, UUID(str(key)))


class ProductModelTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine, expire_on_commit=False)
        self.db = AsyncSqliteSession(self.session)
        self.users = SqliteUserRepository(self.db)

        async def database(): yield self.db
        async def users(): return self.users
        app.dependency_overrides[get_db] = database
        app.dependency_overrides[get_user_repository] = users
        self.patches = [patch.object(middleware, "settings", replace(settings, rate_limit_enabled=False)),
                        patch.object(AuthService, "send_one_time_token", new=AsyncMock())]
        for current in self.patches: current.start()
        self.mode_patches = []
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        for current in self.mode_patches + self.patches: current.stop()
        app.dependency_overrides.clear()
        self.session.close()
        self.engine.dispose()

    def mode(self, model):
        for current in self.mode_patches: current.stop()
        self.mode_patches = [patch.object(module, "settings", replace(settings, product_model=model))
                             for module in [workspaces, organizations, access, invitations]]
        for current in self.mode_patches: current.start()

    def register(self, email="owner@example.com"):
        response = self.client.post("/auth/register", json={"email": email, "name": "Owner", "password": "workspace-password123"})
        self.assertEqual(response.status_code, 201, response.text)
        return self.session.get(User, UUID(response.json()["id"]))

    def headers(self, user):
        self.client.cookies.set(settings.csrf_cookie_name, "workspace-csrf")
        return {"Authorization": "Bearer " + encode_access_token(user.id), "X-CSRF-Token": "workspace-csrf"}

    def bootstrap(self, user):
        response = self.client.post("/workspaces/bootstrap", headers=self.headers(user))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        return response.json()

    def test_teams_default_preserves_manual_organization_workflow(self):
        self.mode("teams")
        user = self.register()
        self.assertEqual(self.session.scalar(select(func.count()).select_from(Organization)), 0)
        self.assertEqual(self.bootstrap(user), {"model": "teams", "personalWorkspace": None, "teams": [], "billingSupported": True})
        team = self.client.post("/organizations", headers=self.headers(user), json={"name": "Acme", "slug": "acme"})
        self.assertEqual(team.status_code, 201, team.text)
        self.assertEqual(self.bootstrap(user)["teams"][0]["id"], team.json()["id"])

    def test_individual_registration_creates_one_private_space_and_bootstrap_is_idempotent(self):
        self.mode("individual")
        user = self.register()
        self.assertEqual(self.session.scalar(select(func.count()).select_from(Organization)), 1)
        first = self.bootstrap(user)
        second = self.bootstrap(user)
        self.assertEqual(first, second)
        self.assertEqual(first["teams"], [])
        workspace = self.session.get(Organization, UUID(first["personalWorkspace"]["id"]))
        self.assertEqual(workspace.personal_owner_user_id, user.id)
        self.assertEqual(self.session.scalar(select(func.count()).select_from(Membership)), 1)
        response = self.client.post("/workspaces/bootstrap", headers={"Authorization": "Bearer " + encode_access_token(user.id)})
        self.assertEqual(response.status_code, 403)

    def test_existing_user_bootstrap_keeps_legacy_teams_and_personal_billing_separate(self):
        self.mode("teams")
        user = self.register()
        response = self.client.post("/organizations", headers=self.headers(user), json={"name": "Legacy", "slug": "legacy"})
        team_id = UUID(response.json()["id"])
        self.mode("mixed")
        context = self.bootstrap(user)
        personal_id = UUID(context["personalWorkspace"]["id"])
        self.assertEqual(context["teams"][0]["id"], str(team_id))
        self.assertNotEqual(personal_id, team_id)
        self.session.add_all([Subscription(organization_id=personal_id, plan="personal-plan", status="active"),
                              Subscription(organization_id=team_id, plan="team-plan", status="active")])
        self.session.commit()
        for workspace_id, plan in [(personal_id, "personal-plan"), (team_id, "team-plan")]:
            result = self.client.get(f"/billing/organizations/{workspace_id}", headers=self.headers(user))
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.json()["plan"], plan)
        self.mode("individual")
        self.assertEqual(self.bootstrap(user)["teams"], [])
        self.assertIsNotNone(self.session.get(Organization, team_id))
        self.assertEqual(self.client.get(f"/billing/organizations/{team_id}", headers=self.headers(user)).status_code, 403)

    def test_personal_workspaces_cannot_be_shared_or_accessed_by_another_user(self):
        self.mode("mixed")
        owner = self.register()
        attacker = self.register("attacker@example.com")
        personal_id = UUID(self.bootstrap(owner)["personalWorkspace"]["id"])
        # Even a corrupt/legacy membership must not override personal ownership.
        self.session.add(Membership(organization_id=personal_id, user_id=attacker.id, role="owner"))
        self.session.commit()
        self.assertEqual(self.client.get(f"/billing/organizations/{personal_id}", headers=self.headers(attacker)).status_code, 403)
        for path, body in [(f"/organizations/{personal_id}/invitations", {"email": attacker.email, "role": "member"}),
                           (f"/organizations/{personal_id}/ownership/transfer", {"user_id": str(attacker.id)})]:
            response = self.client.post(path, headers=self.headers(owner), json=body)
            self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(self.client.get(f"/organizations/{personal_id}/members", headers=self.headers(owner)).status_code, 403)
        listed = self.client.get("/organizations", headers=self.headers(attacker)).json()
        self.assertNotIn(str(personal_id), [row["id"] for row in listed])

    def test_individual_rejects_team_creation_and_accepting_invitations(self):
        self.mode("individual")
        user = self.register()
        self.assertEqual(self.client.post("/organizations", headers=self.headers(user), json={"name": "Acme", "slug": "acme"}).status_code, 403)
        self.assertEqual(self.client.post("/organizations/invitations/accept", headers=self.headers(user), json={"token": "x" * 64}).status_code, 403)

    def test_personal_slug_collision_preserves_legacy_team_and_still_bootstraps(self):
        self.mode("teams")
        user = self.register()
        team = Organization(name="Legacy", slug=f"personal-{user.id}", created_by_id=user.id)
        self.session.add(team)
        self.session.flush()
        self.session.add(Membership(organization_id=team.id, user_id=user.id, role="owner"))
        self.session.commit()
        self.mode("mixed")
        context = self.bootstrap(user)
        self.assertNotEqual(context["personalWorkspace"]["slug"], team.slug)
        self.assertEqual(context["teams"][0]["id"], str(team.id))
        self.assertIsNone(team.personal_owner_user_id)

    def test_oauth_registration_provisions_personal_space_and_reserved_slugs_are_rejected(self):
        self.mode("mixed")
        profile = SimpleNamespace(email="oauth@example.com", name="OAuth", provider_account_id="oauth-subject")
        asyncio.run(AuthService(self.db, self.users).login_oauth("github", profile))
        user = asyncio.run(self.users.get_user_by_email(profile.email))
        self.assertTrue(self.bootstrap(user)["personalWorkspace"])
        response = self.client.post("/organizations", headers=self.headers(user), json={"name": "Reserved", "slug": "personal-reserved"})
        self.assertEqual(response.status_code, 400)

    def test_invalid_product_model_fails_validation(self):
        with self.assertRaisesRegex(RuntimeError, "PRODUCT_MODEL"):
            Settings(product_model="anything").validate()

    def test_personal_deactivation_requires_cancellation_of_renewable_paid_subscription(self):
        self.mode("individual")
        for index, (provider, provider_id, status, scheduled, expected) in enumerate([
            ("manual", None, "active", False, 204),
            ("stripe", "sub_active", "active", False, 409),
            ("stripe", "sub_trialing", "trialing", False, 409),
            ("stripe", "sub_unpaid", "unpaid", False, 409),
            ("stripe", "sub_scheduled", "active", True, 204),
            ("stripe", "sub_canceled", "canceled", False, 204),
        ]):
            with self.subTest(provider=provider, status=status, scheduled=scheduled):
                user = self.register(f"deactivate{index}@example.com")
                personal_id = UUID(self.bootstrap(user)["personalWorkspace"]["id"])
                self.session.add(Subscription(organization_id=personal_id, provider=provider,
                    provider_subscription_id=provider_id, status=status, cancel_at_period_end=scheduled))
                self.session.commit()
                response = self.client.post("/users/me/deactivate", headers=self.headers(user))
                self.assertEqual(response.status_code, expected, response.text)
                if expected == 409:
                    self.assertEqual(response.json()["error"]["code"], "ACTIVE_PERSONAL_SUBSCRIPTION")
                self.session.refresh(user)
                self.assertEqual(user.is_active, expected == 409)

    def test_migration_preserves_existing_team_rows_and_reverts(self):
        migration_path = Path(__file__).parents[1] / "alembic/versions/20261026_0009_personal_workspaces.py"
        spec = importlib.util.spec_from_file_location("personal_workspace_migration", migration_path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        with self.engine.begin() as connection:
            # Simulate the schema just before this additive migration.
            connection.exec_driver_sql("DROP TABLE organizations")
            connection.exec_driver_sql("CREATE TABLE organizations (id CHAR(32) PRIMARY KEY, name VARCHAR(160), slug VARCHAR(160), created_by_id CHAR(32))")
            connection.exec_driver_sql("INSERT INTO organizations VALUES ('legacy', 'Legacy', 'legacy', 'owner')")
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
            self.assertIn("personal_owner_user_id", [column["name"] for column in inspect(connection).get_columns("organizations")])
            self.assertEqual(connection.exec_driver_sql("SELECT personal_owner_user_id FROM organizations WHERE id='legacy'").scalar(), None)
            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()
            self.assertEqual(connection.exec_driver_sql("SELECT name FROM organizations WHERE id='legacy'").scalar(), "Legacy")
