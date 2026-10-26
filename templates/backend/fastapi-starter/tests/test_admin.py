"""Real HTTP/auth/query contracts backed by SQLite's SQLAlchemy dialect.

The async adapter uses a synchronous SQLite session, so no optional aiosqlite
test dependency is needed. PostgreSQL locking and migrations require integration
checks against PostgreSQL itself.
"""
import asyncio
import importlib.util
import unittest
from datetime import timedelta
from pathlib import Path
from uuid import UUID, uuid4
from unittest.mock import patch

from fastapi.testclient import TestClient
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from main import app
from src.core import middleware as middleware_module
from src.core.config import settings
from src.db.base import Base, utc_now
from src.db.database import get_db
from src.modules.admin.service import set_platform_admin
from src.modules.auth.dependencies import get_user_repository
from src.modules.auth.security.tokens import encode_access_token
from src.modules.users.model import Membership, Organization, PlatformAdmin, Subscription, User


class AsyncSqliteSession:
    def __init__(self, session):
        self.session = session

    async def execute(self, statement):
        return self.session.execute(statement)

    async def scalar(self, statement):
        return self.session.scalar(statement)

    async def get(self, model, key):
        return self.session.get(model, key)

    def add(self, value):
        self.session.add(value)

    async def commit(self):
        self.session.commit()

    async def get_user_by_id(self, key):
        return self.session.get(User, UUID(str(key)))


class PlatformAdminTests(unittest.TestCase):
    paths = ("access", "overview", "users", "organizations", "subscriptions")

    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine, expire_on_commit=False)
        self.db = AsyncSqliteSession(self.session)
        self.admin = User(email="operator@example.test", name="Operator", email_verified=True, is_active=True, password_hash="PASSWORD_SECRET")
        self.owner = User(email="owner@example.test", name="Owner", email_verified=True, is_active=True)
        self.unverified = User(email="unverified@example.test", name="Unverified", email_verified=False, is_active=True)
        self.inactive = User(email="inactive@example.test", name="Inactive", email_verified=True, is_active=False)
        self.session.add_all([self.admin, self.owner, self.unverified, self.inactive])
        self.session.flush()
        self.organization = Organization(name="Example organization", slug="example-org", created_by_id=self.owner.id)
        self.session.add(self.organization)
        self.session.flush()
        self.session.add(Membership(organization_id=self.organization.id, user_id=self.owner.id, role="admin"))
        self.session.add(Subscription(organization_id=self.organization.id, provider="stripe", plan="pro", status="active", seats=3,
                                      provider_subscription_id="PROVIDER_SECRET", provider_customer_id="CUSTOMER_SECRET", metadata_={"private": "METADATA_SECRET"}))
        self.session.add_all([PlatformAdmin(user_id=self.admin.id), PlatformAdmin(user_id=self.unverified.id), PlatformAdmin(user_id=self.inactive.id)])
        self.session.commit()

        async def override_db():
            yield self.db

        async def override_users():
            return self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_user_repository] = override_users
        self.limiter = patch.object(middleware_module, "settings", type(settings)(**{**settings.__dict__, "rate_limit_enabled": False}))
        self.limiter.start()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        self.limiter.stop()
        self.session.close()
        self.engine.dispose()

    def get(self, path, user=None):
        headers = {"Authorization": f"Bearer {encode_access_token((user or self.admin).id)}"}
        return self.client.get("/admin/" + path, headers=headers)

    def test_anonymous_and_organization_admins_have_no_global_access(self):
        for path in self.paths:
            response = self.client.get("/admin/" + path)
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.headers["cache-control"], "private, no-store")
        self.assertEqual(self.get("access", self.owner).json(), {"allowed": False, "resources": ["users", "organizations", "subscriptions"]})
        for path in self.paths[1:]:
            response = self.get(path, self.owner)
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.json()["error"]["code"], "PLATFORM_ADMIN_REQUIRED")
            self.assertEqual(response.headers["cache-control"], "private, no-store")

    def test_global_grant_still_requires_active_verified_user(self):
        self.assertFalse(self.get("access", self.unverified).json()["allowed"])
        self.assertEqual(self.get("users", self.unverified).status_code, 403)
        self.assertEqual(self.get("users", self.inactive).status_code, 403)

    def test_summary_counts_and_period_come_from_database(self):
        self.owner.created_at = utc_now() - timedelta(days=50)
        self.session.commit()
        response = self.get("overview?days=7")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"periodDays": 7, "totalUsers": 4, "enabledUsers": 3, "verifiedUsers": 3,
            "newUsers": 3, "totalOrganizations": 1, "newOrganizations": 1, "totalSubscriptions": 1,
            "subscriptionsByStatus": [{"status": "active", "count": 1}], "subscriptionsByPlan": [{"plan": "pro", "count": 1}]})

    def test_users_search_is_literal_paged_and_has_no_authentication_secrets(self):
        response = self.get("users?search=OPERATOR%40EXAMPLE&pageSize=1")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual((body["total"], body["page"], body["pageSize"]), (1, 1, 1))
        self.assertEqual(set(body["items"][0]), {"id", "email", "name", "emailVerified", "isActive", "createdAt"})
        self.assertNotIn("SECRET", response.text)
        self.assertEqual(self.get("users?search=%25").json()["total"], 0)
        self.assertEqual(self.get("users?search=_").json()["total"], 0)
        self.assertEqual(self.get("users?page=2&pageSize=100").json()["items"], [])

    def test_organizations_and_subscriptions_return_safe_fields(self):
        organizations = self.get("organizations?search=EXAMPLE").json()
        self.assertEqual(organizations["items"][0]["memberCount"], 1)
        response = self.get("subscriptions?search=pro")
        self.assertEqual(response.status_code, 200)
        item = response.json()["items"][0]
        self.assertEqual((item["organizationName"], item["seats"]), ("Example organization", 3))
        self.assertNotIn("SECRET", response.text)
        self.assertEqual(set(item), {"id", "organizationId", "organizationName", "provider", "plan", "status", "seats", "cancelAtPeriodEnd", "currentPeriodStart", "currentPeriodEnd"})

    def test_bounds_and_unknown_query_arguments_are_rejected(self):
        for path in ["users?page=0", "users?page=10001", "users?pageSize=101", "users?pageSize=1.5", "users?search=" + "x" * 121,
                     "overview?days=0", "overview?days=366", "overview?other=true", "users?role=admin"]:
            response = self.get(path)
            self.assertEqual(response.status_code, 422, path)
            self.assertEqual(response.headers["cache-control"], "private, no-store")

    def test_operator_grants_are_idempotent_and_revocation_applies_to_existing_token(self):
        headers = {"Authorization": f"Bearer {encode_access_token(self.owner.id)}"}
        asyncio.run(set_platform_admin(self.db, "grant", self.owner.id))
        asyncio.run(set_platform_admin(self.db, "grant", self.owner.id))
        self.assertTrue(self.client.get("/admin/access", headers=headers).json()["allowed"])
        asyncio.run(set_platform_admin(self.db, "revoke", self.owner.id))
        asyncio.run(set_platform_admin(self.db, "revoke", self.owner.id))
        self.assertEqual(self.client.get("/admin/users", headers=headers).status_code, 403)

    def test_operator_rejects_ineligible_missing_or_invalid_commands(self):
        for user in [self.unverified, self.inactive]:
            with self.assertRaisesRegex(ValueError, "Only active"):
                asyncio.run(set_platform_admin(self.db, "grant", user.id))
        with self.assertRaisesRegex(ValueError, "not found"):
            asyncio.run(set_platform_admin(self.db, "grant", uuid4()))
        with self.assertRaisesRegex(ValueError, "Operation"):
            asyncio.run(set_platform_admin(self.db, "delete", self.admin.id))


class PlatformAdminMigrationTests(unittest.TestCase):
    def test_migration_preserves_user_foreign_key_and_can_be_reverted(self):
        path = Path(__file__).parents[1] / "alembic/versions/20261026_0008_platform_admins.py"
        spec = importlib.util.spec_from_file_location("platform_admin_migration", path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        self.assertEqual(migration.down_revision, "20261014_0007")
        engine = create_engine("sqlite://")
        try:
            with engine.begin() as connection:
                User.__table__.create(connection)
                with Operations.context(MigrationContext.configure(connection)):
                    migration.upgrade()
                    schema = inspect(connection)
                    self.assertEqual(schema.get_pk_constraint("platform_admins")["constrained_columns"], ["user_id"])
                    foreign_key = schema.get_foreign_keys("platform_admins")[0]
                    self.assertEqual(foreign_key["referred_table"], "users")
                    self.assertEqual(foreign_key["options"].get("ondelete"), "CASCADE")
                    migration.downgrade()
                    self.assertNotIn("platform_admins", inspect(connection).get_table_names())
        finally:
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
