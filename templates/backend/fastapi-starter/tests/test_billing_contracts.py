import unittest
import asyncio
import json
from threading import Barrier
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import stripe
from fastapi.testclient import TestClient

from main import app
from src.core.config import settings
from src.core.exceptions import AppError
from src.db.database import get_db
from src.modules.auth.security.tokens import get_current_user
from src.modules.billing.router import CreateCheckout
from src.modules.billing.service import BillingService, _PRICE_CACHE


class BillingContractTests(unittest.TestCase):
    def setUp(self):
        _PRICE_CACHE.clear()

    def test_prices_labels_cache_and_provider_outage(self):
        config = replace(settings, stripe_secret_key="sk_test", stripe_webhook_secret="whsec_test",
                         stripe_price_plans=json.dumps({"price_allowed": {"name": "Pro", "entitlements": {"api_calls": None}, "labels": {"api_calls": "API calls"}}}))
        service = BillingService(AsyncMock(), config)
        for interval, count, amount in [("month", 1, 2900), ("year", 1, 29000), ("month", 3, 7900), (None, 1, 4900)]:
            with self.subTest(interval=interval, count=count):
                _PRICE_CACHE.clear()
                provider = {"unit_amount": amount, "currency": "eur", "recurring": {"interval": interval, "interval_count": count} if interval else None}
                with patch("src.modules.billing.service.stripe.Price.retrieve", return_value=provider) as retrieve:
                    plan = asyncio.run(service.configuration())["plans"][0]
                    self.assertEqual(plan["price"], {"unitAmount": amount, "currency": "eur", "interval": interval, "intervalCount": count})
                    self.assertEqual(plan["labels"], {"api_calls": "API calls"})
                    # New request/service instances reuse the process cache.
                    asyncio.run(BillingService(AsyncMock(), config).configuration())
                    retrieve.assert_called_once_with("price_allowed", api_key="sk_test")
                    with patch("src.modules.billing.service.monotonic", return_value=float("inf")):
                        asyncio.run(service.configuration())
                    self.assertEqual(retrieve.call_count, 2)
        _PRICE_CACHE.clear()
        with patch("src.modules.billing.service.stripe.Price.retrieve", side_effect=RuntimeError("Stripe down")):
            self.assertIsNone(asyncio.run(service.configuration())["plans"][0]["price"])
        with patch("src.modules.billing.service.stripe.Price.retrieve") as retrieve:
            unconfigured = BillingService(AsyncMock(), replace(config, stripe_secret_key=None, stripe_webhook_secret=None))
            self.assertIsNone(asyncio.run(unconfigured.configuration())["plans"][0]["price"])
            retrieve.assert_not_called()

    def test_prices_are_requested_in_parallel(self):
        config = replace(settings, stripe_secret_key="sk_test", stripe_webhook_secret="whsec_test",
                         stripe_price_plans=json.dumps({price: {"name": price, "entitlements": {}} for price in ["price_a", "price_b", "price_c"]}))
        rendezvous = Barrier(3, timeout=5)

        def retrieve(price_id, **kwargs):
            # Sequential requests break the barrier and return null prices.
            rendezvous.wait()
            return {"unit_amount": 2900, "currency": "eur", "recurring": None}

        with patch("src.modules.billing.service.stripe.Price.retrieve", side_effect=retrieve) as provider:
            plans = asyncio.run(BillingService(AsyncMock(), config).configuration())["plans"]
        self.assertEqual(provider.call_count, 3)
        self.assertEqual([plan["priceId"] for plan in plans], ["price_a", "price_b", "price_c"])
        self.assertTrue(all(plan["price"] and plan["price"]["unitAmount"] == 2900 for plan in plans))

    def test_prices_cache_lasts_one_day(self):
        config = replace(settings, stripe_secret_key="sk_test", stripe_webhook_secret="whsec_test",
                         stripe_price_plans='{"price_allowed":{"name":"Pro","entitlements":{}}}')
        service = BillingService(AsyncMock(), config)
        with patch("src.modules.billing.service.monotonic", return_value=100) as clock, patch(
            "src.modules.billing.service.stripe.Price.retrieve",
            return_value={"unit_amount": 2900, "currency": "eur", "recurring": None},
        ) as provider:
            asyncio.run(service.configuration())
            clock.return_value = 100 + 86_399
            asyncio.run(service.configuration())
            self.assertEqual(provider.call_count, 1)
            clock.return_value = 100 + 86_401
            asyncio.run(service.configuration())
            self.assertEqual(provider.call_count, 2)

    def test_labels_must_be_strings_for_existing_entitlements(self):
        for labels in [None, [], "API calls", {"unknown": "Unknown"}, {"api_calls": 3}, {"api_calls": None}]:
            with self.subTest(labels=labels):
                config = replace(settings, stripe_price_plans=json.dumps({"price_allowed": {"name": "Pro", "entitlements": {"api_calls": None}, "labels": labels}}))
                with self.assertRaises(AppError) as error:
                    BillingService(AsyncMock(), config).price_plans()
                self.assertEqual(error.exception.code, "INVALID_BILLING_CONFIGURATION")

    def test_configuration_http_contract_without_stripe(self):
        config = replace(settings, stripe_secret_key=None, stripe_webhook_secret=None,
                         stripe_price_plans='{"price_allowed":{"name":"Pro","entitlements":{"api_calls":null}}}')
        service = BillingService(AsyncMock(), config)
        overrides = app.dependency_overrides.copy()
        app.dependency_overrides[get_db] = lambda: AsyncMock()
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=uuid4())
        try:
            with patch("src.modules.billing.router.require_billing_role", new_callable=AsyncMock), patch("src.modules.billing.router.BillingService", return_value=service), TestClient(app) as client:
                response = client.get(f"/billing/organizations/{uuid4()}/configuration")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), {"configured": False, "provider": "stripe", "usageMeterConfigured": False,
                    "plans": [{"priceId": "price_allowed", "name": "Pro", "entitlements": {"api_calls": None}, "labels": {}, "price": None}]})
        finally:
            app.dependency_overrides.clear()
            app.dependency_overrides.update(overrides)

    def test_checkout_accepts_the_public_camel_case_price_id(self):
        self.assertEqual(CreateCheckout.model_validate({"priceId": "price_allowed"}).price_id, "price_allowed")
        self.assertEqual(CreateCheckout.model_validate({"price_id": "price_allowed"}).price_id, "price_allowed")

    def test_unconfigured_billing_is_explicit_and_free_entitlements_are_validated(self):
        service = BillingService(AsyncMock(), replace(settings, stripe_secret_key=None, stripe_webhook_secret=None, stripe_price_plans="{}", billing_free_entitlements='{"api_calls":100}'))
        self.assertEqual(asyncio.run(service.configuration()), {"configured": False, "provider": "stripe", "usageMeterConfigured": False, "plans": []})
        self.assertEqual(service.free_entitlements(), {"api_calls": 100})

    def test_only_allowlisted_prices_are_accepted(self):
        service = BillingService(AsyncMock(), replace(settings, stripe_secret_key="sk_test", stripe_webhook_secret="whsec_test", stripe_price_plans='{"price_allowed":{"name":"pro","entitlements":{"api_calls":null}}}'))
        self.assertIn("price_allowed", service.price_plans())
        with patch("src.modules.billing.service.stripe.Price.retrieve", side_effect=RuntimeError("Stripe down")):
            self.assertEqual(asyncio.run(service.configuration())["plans"], [{"priceId": "price_allowed", "name": "pro", "entitlements": {"api_calls": None}, "labels": {}, "price": None}])
        with self.assertRaises(AppError) as error:
            asyncio.run(service.checkout(uuid4(), "price_not_allowed", 1, uuid4()))
        self.assertEqual(error.exception.code, "BILLING_PRICE_NOT_AVAILABLE")

    def test_webhook_requires_stripe_signature_and_browser_cannot_report_usage(self):
        client = TestClient(app)
        response = client.post("/billing/webhooks/stripe", content=b"{}")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(client.post(f"/billing/organizations/{uuid4()}/usage").status_code, 404)
        client.close()

    def test_stripe_settings_must_be_configured_as_a_pair(self):
        with self.assertRaisesRegex(RuntimeError, "configured together"):
            replace(settings, stripe_secret_key="sk_test", stripe_webhook_secret=None).validate()
        with self.assertRaisesRegex(RuntimeError, "at least one plan"):
            replace(settings, stripe_secret_key="sk_test", stripe_webhook_secret="whsec_test", stripe_price_plans="{}").validate()

    def test_checkout_and_portal_audit_only_safe_business_metadata(self):
        class Session:
            def __init__(self):
                self.added = []
                self.commits = 0

            def add(self, value):
                self.added.append(value)

            async def commit(self):
                self.commits += 1

        config = replace(
            settings,
            stripe_secret_key="sk_test",
            stripe_webhook_secret="whsec_test",
            stripe_price_plans='{"price_allowed":{"name":"pro","entitlements":{}}}',
        )
        organization_id, actor_id = uuid4(), uuid4()
        db = Session()
        service = BillingService(db, config)
        service._subscription = AsyncMock(return_value=SimpleNamespace(provider_customer_id="cus_secret"))
        with patch("src.modules.billing.service.stripe.checkout.Session.create", return_value=SimpleNamespace(url="https://checkout.example", id="cs_secret")) as create_checkout:
            result = asyncio.run(service.checkout(organization_id, "price_allowed", 2, actor_id))
        self.assertEqual(result["sessionId"], "cs_secret")
        self.assertEqual(create_checkout.call_args.kwargs["success_url"], f"{config.frontend_url.rstrip('/')}/billing?organizationId={organization_id}&checkout=success&session_id={{CHECKOUT_SESSION_ID}}")
        self.assertEqual(create_checkout.call_args.kwargs["cancel_url"], f"{config.frontend_url.rstrip('/')}/billing?organizationId={organization_id}&checkout=cancelled")
        checkout_event = db.added[-1]
        self.assertEqual(checkout_event.metadata_, {"provider": "stripe", "plan": "pro", "quantity": 2})
        self.assertNotIn("cs_secret", repr(checkout_event.__dict__))
        self.assertNotIn("cus_secret", repr(checkout_event.__dict__))

        db.added.clear()
        with patch("src.modules.billing.service.stripe.billing_portal.Session.create", return_value=SimpleNamespace(url="https://portal.example", id="bps_secret")) as create_portal:
            asyncio.run(service.portal(organization_id, actor_id))
        self.assertEqual(create_portal.call_args.kwargs["return_url"], f"{config.frontend_url.rstrip('/')}/billing?organizationId={organization_id}")
        portal_event = db.added[-1]
        self.assertEqual(portal_event.metadata_, {"provider": "stripe"})
        self.assertNotIn("bps_secret", repr(portal_event.__dict__))

    def test_subscription_replacement_rejects_foreign_or_active_and_ignores_old_events(self):
        organization_id = uuid4()
        config = replace(settings, stripe_secret_key="sk_test", stripe_webhook_secret="whsec_test",
                         stripe_price_plans='{"price_allowed":{"name":"pro","entitlements":{"api_calls":100}}}')
        old = {"id": "sub_old", "customer": "cus_ours", "created": 20, "status": "canceled"}
        new = {"id": "sub_new", "customer": "cus_ours", "created": 20, "status": "active",
               "items": {"data": [{"price": {"id": "price_allowed"}}]}}

        async def sync(local, incoming, provider):
            db = AsyncMock()
            db.execute.side_effect = [
                SimpleNamespace(scalar_one_or_none=lambda: local if incoming["customer"] == local.provider_customer_id else None),
                SimpleNamespace(),
                SimpleNamespace(scalar_one_or_none=lambda: local),
            ]
            service = BillingService(db, config)
            service._configure_stripe = lambda: None
            service._replace_entitlements = AsyncMock()
            with patch("src.modules.billing.service.stripe.Subscription.retrieve", side_effect=lambda sid: provider[sid]):
                await service._sync_subscription(incoming)
            return service

        local = SimpleNamespace(organization_id=organization_id, provider_customer_id="cus_ours",
                                provider_subscription_id="sub_old", status="canceled")
        event = {**new, "metadata": {"organization_id": str(organization_id)}}
        service = asyncio.run(sync(local, event, {"sub_old": old, "sub_new": new}))
        self.assertEqual((local.provider_subscription_id, local.plan, local.status), ("sub_new", "pro", "active"))
        self.assertEqual(local.metadata_["previous_subscription_ids"], ["sub_old"])
        service._replace_entitlements.assert_awaited_once()

        old_event = {**old, "metadata": {"organization_id": str(organization_id)}}
        service = asyncio.run(sync(local, old_event, {"sub_old": old, "sub_new": new}))
        self.assertEqual(local.provider_subscription_id, "sub_new")
        service._replace_entitlements.assert_not_awaited()

        # Both subscriptions were created in the same second, and the new one
        # has since become terminal. Only the recorded old ID is stale.
        tied_old = {**old, "created": 20}
        terminal_new = {**new, "status": "canceled"}
        local.status = "canceled"
        service = asyncio.run(sync(local, {**tied_old, "metadata": {"organization_id": str(organization_id)}},
                                   {"sub_old": tied_old, "sub_new": terminal_new}))
        self.assertEqual(local.provider_subscription_id, "sub_new")
        service._replace_entitlements.assert_not_awaited()
        foreign = {**tied_old, "id": "sub_foreign"}
        with self.assertRaises(AppError) as error:
            asyncio.run(sync(local, {**foreign, "metadata": {"organization_id": str(organization_id)}},
                             {"sub_foreign": foreign, "sub_new": terminal_new}))
        self.assertEqual(error.exception.code, "BILLING_SUBSCRIPTION_MISMATCH")

        local.provider_subscription_id, local.status = "sub_old", "active"
        with self.assertRaises(AppError) as error:
            asyncio.run(sync(local, event, {"sub_old": {**old, "status": "active"}, "sub_new": new}))
        self.assertEqual(error.exception.code, "BILLING_SUBSCRIPTION_MISMATCH")

        local.status = "canceled"
        with self.assertRaises(AppError) as error:
            asyncio.run(sync(local, event, {"sub_old": old, "sub_new": {**new, "customer": "cus_foreign"}}))
        self.assertEqual(error.exception.code, "BILLING_CUSTOMER_MISMATCH")

        with self.assertRaises(AppError) as error:
            asyncio.run(sync(local, {**event, "customer": "cus_foreign"}, {"sub_old": old, "sub_new": new}))
        self.assertEqual(error.exception.code, "BILLING_CUSTOMER_MISMATCH")

    def test_webhook_events_read_stripe_object_metadata(self):
        organization_id = uuid4()
        config = replace(settings, stripe_secret_key="sk_test", stripe_webhook_secret="whsec_test",
                         stripe_price_plans='{"price_allowed":{"name":"pro","entitlements":{"api_calls":100}}}')
        metadata = {"organization_id": str(organization_id)}

        def event(event_type, data):
            return stripe.Event.construct_from({"id": "evt_test", "object": "event", "type": event_type, "data": {"object": data}}, "sk_test")

        checkout = event("checkout.session.completed", {
            "object": "checkout.session", "id": "cs_test", "customer": "cus_ours", "metadata": metadata,
        })
        service = BillingService(AsyncMock(), config)
        service._bind_customer = AsyncMock()
        asyncio.run(service._apply_stripe_event(checkout))
        service._bind_customer.assert_awaited_once_with(organization_id, "cus_ours")

        subscription = {
            "object": "subscription", "id": "sub_new", "customer": "cus_ours", "status": "active", "metadata": metadata,
            "items": {"object": "list", "data": [{"object": "subscription_item", "price": {"object": "price", "id": "price_allowed"}}]},
        }
        db, created = AsyncMock(), []
        db.add = created.append
        db.execute.side_effect = [SimpleNamespace(scalar_one_or_none=lambda: None), SimpleNamespace(),
                                  SimpleNamespace(scalar_one_or_none=lambda: None)]
        service = BillingService(db, config)
        service._configure_stripe = lambda: None
        service._replace_entitlements = AsyncMock()
        retrieved = stripe.Subscription.construct_from(subscription, "sk_test")
        with patch("src.modules.billing.service.stripe.Subscription.retrieve", return_value=retrieved):
            asyncio.run(service._apply_stripe_event(event("customer.subscription.created", subscription)))
        self.assertEqual([(row.organization_id, row.plan, row.status) for row in created], [(organization_id, "pro", "active")])
        service._replace_entitlements.assert_awaited_once()
