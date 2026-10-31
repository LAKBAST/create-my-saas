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
from src.db.base import utc_now
from src.db.database import get_db
from src.modules.auth.security.tokens import get_current_user
from src.modules.billing.router import CreateCheckout
from src.modules.billing.service import BillingService, _PRICE_CACHE


class BillingContractTests(unittest.TestCase):
    def setUp(self):
        _PRICE_CACHE.clear()

    def test_public_plans_http_contract(self):
        config = replace(settings, stripe_secret_key="sk_secret", stripe_price_plans=json.dumps({
            "price_allowed": {"name": "Pro", "priceLabel": "29 €/mes", "entitlements": {"api_calls": 100}, "labels": {"api_calls": "API calls"}, "secret": "hidden"}
        }))
        service = BillingService(AsyncMock(), config)
        with patch("src.modules.billing.router.BillingService", return_value=service), TestClient(app) as client:
            response = client.get("/billing/plans")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "public, max-age=60")
        self.assertEqual(response.json(), {"plans": [{"priceId": "price_allowed", "name": "Pro", "priceLabel": "29 €/mes", "labels": ["API calls"]}]})

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

    def test_portal_cancellation_with_cancel_at_is_scheduled_and_emailed_once(self):
        organization_id = uuid4()
        config = replace(settings, stripe_secret_key="sk_test", stripe_webhook_secret="whsec_test",
                         stripe_price_plans='{"price_allowed":{"name":"Pro mensual","entitlements":{"api_calls":100}}}')
        local = SimpleNamespace(organization_id=organization_id, provider_customer_id="cus_ours", provider_subscription_id="sub_1",
                                status="trialing", cancel_at_period_end=False)
        period_end = 1794528000  # 13 November 2026
        item = {"price": {"id": "price_allowed"}, "current_period_start": 1793318400, "current_period_end": period_end}

        def sync(stripe_state):
            stripe_object = {"id": "sub_1", "customer": "cus_ours", "created": 10, "items": {"data": [item]}, **stripe_state}
            db = AsyncMock()
            db.execute.side_effect = [SimpleNamespace(scalar_one_or_none=lambda: local), SimpleNamespace(),
                                      SimpleNamespace(scalar_one_or_none=lambda: local)]
            service = BillingService(db, config)
            service._configure_stripe = lambda: None
            service._replace_entitlements = AsyncMock()
            with patch("src.modules.billing.service.stripe.Subscription.retrieve", return_value=stripe_object):
                asyncio.run(service._sync_subscription(stripe_object))
            return [(key, values["date"]) for key, _, values in service._notices]

        # The customer portal sets cancel_at and leaves cancel_at_period_end false.
        self.assertEqual(sync({"status": "trialing", "cancel_at_period_end": False, "cancel_at": period_end}),
                         [("subscription_cancellation_scheduled", "13 de noviembre de 2026")])
        self.assertTrue(local.cancel_at_period_end)
        # A repeated or later event with the same schedule sends nothing.
        self.assertEqual(sync({"status": "trialing", "cancel_at_period_end": False, "cancel_at": period_end}), [])
        self.assertEqual(sync({"status": "trialing", "cancel_at_period_end": False, "cancel_at": None}),
                         [("subscription_cancellation_reverted", "13 de noviembre de 2026")])
        self.assertFalse(local.cancel_at_period_end)
        self.assertEqual(sync({"status": "active", "cancel_at_period_end": True, "cancel_at": period_end}),
                         [("subscription_cancellation_scheduled", "13 de noviembre de 2026")])
        self.assertEqual(sync({"status": "canceled", "cancel_at_period_end": False, "cancel_at": period_end, "ended_at": period_end}),
                         [("subscription_ended", "13 de noviembre de 2026")])
        self.assertEqual(sync({"status": "canceled", "cancel_at_period_end": False, "cancel_at": period_end, "ended_at": period_end}), [])

    def test_subscription_notices_go_to_billing_members_after_the_webhook(self):
        organization_id = uuid4()
        db = AsyncMock()
        db.execute.side_effect = [SimpleNamespace(scalar_one_or_none=lambda: "Acme"),
                                  SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: ["owner@example.com", "billing@example.com"]))]
        service = BillingService(db, replace(settings, frontend_url="https://app.example.com"))
        from datetime import datetime, timezone
        service._notice("subscription_cancellation_scheduled", organization_id, "Pro mensual", datetime(2026, 11, 13, tzinfo=timezone.utc))
        delivery = AsyncMock()
        with patch("src.modules.billing.service.send_secure_email", new=delivery):
            asyncio.run(service._send_notices())
        self.assertEqual([call.kwargs["recipient"] for call in delivery.await_args_list], ["owner@example.com", "billing@example.com"])
        message = delivery.await_args.kwargs
        self.assertEqual(message["subject"], "Tu suscripción se cancelará el 13 de noviembre de 2026")
        self.assertIn("La suscripción Pro mensual de Acme se cancelará el 13 de noviembre de 2026", message["body"])
        self.assertIn("https://app.example.com/billing", message["html"])
        self.assertEqual(service._notices, [])
        # A failed delivery is logged and does not fail the stored webhook.
        db.execute.side_effect = [SimpleNamespace(scalar_one_or_none=lambda: "Acme"),
                                  SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: ["owner@example.com"]))]
        service._notice("subscription_ended", organization_id, "Pro mensual", None)
        with patch("src.modules.billing.service.send_secure_email", new=AsyncMock(side_effect=RuntimeError("down"))):
            asyncio.run(service._send_notices())

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

    def test_webhook_syncs_stripe_quantity_to_snapshot_seats(self):
        organization_id = uuid4()
        config = replace(settings, stripe_secret_key="sk_test", stripe_webhook_secret="whsec_test",
                         stripe_price_plans='{"price_allowed":{"name":"pro","entitlements":{"api_calls":100}}}')
        created = []

        def deliver(event_type, items):
            subscription = {
                "object": "subscription", "id": "sub_1", "customer": "cus_ours", "status": "active",
                "metadata": {"organization_id": str(organization_id)}, "items": {"object": "list", "data": items},
            }
            local = created[0] if created else None
            db = AsyncMock()
            db.add = created.append
            db.execute.side_effect = [
                SimpleNamespace(scalar_one_or_none=lambda: local), SimpleNamespace(), SimpleNamespace(scalar_one_or_none=lambda: local),
                # BillingService.snapshot: subscription, entitlements and usage.
                SimpleNamespace(scalar_one_or_none=lambda: created[0]), SimpleNamespace(scalars=lambda: []), [],
            ]
            service = BillingService(db, config)
            service._configure_stripe = lambda: None
            service._replace_entitlements = AsyncMock()
            event = stripe.Event.construct_from({"id": "evt_test", "object": "event", "type": event_type, "data": {"object": subscription}}, "sk_test")
            with patch("src.modules.billing.service.stripe.Subscription.retrieve", return_value=stripe.Subscription.construct_from(subscription, "sk_test")):
                asyncio.run(service._apply_stripe_event(event))
            return asyncio.run(service.snapshot(organization_id))["seats"]

        def item(**quantity):
            return {"object": "subscription_item", "price": {"object": "price", "id": "price_allowed"},
                    "current_period_start": 1793318400, "current_period_end": 1794528000, **quantity}

        self.assertEqual(deliver("customer.subscription.created", [item(quantity=2)]), 2)
        self.assertEqual(deliver("customer.subscription.updated", [item(quantity=3)]), 3)
        self.assertEqual(len(created), 1)

        # Without a usable quantity the subscription has one seat, not the previous count.
        for label, items in [("missing", [item()]), ("no items", []), ("null", [item(quantity=None)]), ("zero", [item(quantity=0)]),
                             ("negative", [item(quantity=-2)]), ("boolean", [item(quantity=True)]), ("text", [item(quantity="3")])]:
            with self.subTest(label):
                created[0].seats, created[0].updated_at = 3, utc_now()
                self.assertEqual(deliver("customer.subscription.updated", items), 1)
