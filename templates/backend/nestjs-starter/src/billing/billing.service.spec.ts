import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { DataSource, Repository } from 'typeorm';
import { BillingCustomer } from './billing-customer.entity';
import { BillingEntitlement } from './billing-entitlement.entity';
import { BillingService } from './billing.service';
import { BillingWebhookEvent } from './billing-webhook-event.entity';
import { Subscription } from './subscription.entity';
import { UsageRecord } from './usage-record.entity';
import { Organization } from '../organizations/organization.entity';

describe('BillingService', () => {
  function setup(values: Record<string, unknown> = {}) {
    const repository = () => ({ findOneBy: jest.fn(), findOne: jest.fn(), find: jest.fn(), save: jest.fn(), create: jest.fn((value) => value), delete: jest.fn(), createQueryBuilder: jest.fn() });
    const customers = repository(); const subscriptions = repository(); const entitlements = repository(); const usage = repository(); const events = repository(); const organizations = repository();
    const manager = { getRepository: jest.fn((entity) => entity === BillingWebhookEvent ? events : entity === BillingCustomer ? customers : entity === Subscription ? subscriptions : entity === BillingEntitlement ? entitlements : repository()) };
    // Billing members read when a subscription notice is emailed.
    const members = { innerJoin: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), getRawMany: jest.fn(async () => [] as Array<{ email: string }>) };
    const dataSource = { manager, transaction: jest.fn(async (callback) => callback(manager)), getRepository: jest.fn(() => ({ createQueryBuilder: jest.fn(() => members) })) };
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
      getOrThrow: jest.fn((key: string) => values[key]),
    };
    const audit = { record: jest.fn(async (event) => event) };
    const secureEmail = { send: jest.fn(async () => undefined) };
    return {
      service: new BillingService(
        customers as unknown as Repository<BillingCustomer>,
        subscriptions as unknown as Repository<Subscription>,
        entitlements as unknown as Repository<BillingEntitlement>,
        usage as unknown as Repository<UsageRecord>,
        organizations as unknown as Repository<Organization>,
        dataSource as unknown as DataSource,
        config as unknown as ConfigService,
        audit as never,
        secureEmail as never,
      ),
      events, config, audit, customers, subscriptions, entitlements, manager, organizations, members, secureEmail,
    };
  }

  it('makes an unconfigured portal explicit instead of returning a misleading link', async () => {
    const { service } = setup();
    await expect(service.portal('fdafb779-347e-4ec0-b240-859f2e3985b4', 'actor-1')).resolves.toEqual({ configured: false, url: null, reason: 'Stripe billing is not configured.' });
    await expect(service.checkout('fdafb779-347e-4ec0-b240-859f2e3985b4', 'price_pro_monthly', 1, 'actor-1')).resolves.toEqual({ configured: false, url: null, sessionId: null });
  });

  it('returns only allowlisted plans for an authenticated billing screen', async () => {
    const { service } = setup({ STRIPE_SECRET_KEY: 'sk_test', STRIPE_WEBHOOK_SECRET: 'whsec_test', STRIPE_PRICE_PLANS: '{"price_promonthly":{"name":"pro","entitlements":{"api_calls":1000}}}' });
    jest.spyOn(service as never, 'stripe').mockReturnValue({ prices: { retrieve: jest.fn().mockRejectedValue(new Error('Stripe down')) } } as never);
    await expect(service.configuration()).resolves.toMatchObject({ configured: true, plans: [{ priceId: 'price_promonthly', name: 'pro', entitlements: { api_calls: 1000 }, labels: {}, price: null }] });
  });

  it.each([['month', 1, 2900], ['year', 1, 29000], ['month', 3, 7900], [null, 1, 4900]])('returns and caches %s prices (%s periods)', async (interval, intervalCount, unitAmount) => {
    const { service } = setup({ STRIPE_SECRET_KEY: 'sk_test', STRIPE_WEBHOOK_SECRET: 'whsec_test', STRIPE_PRICE_PLANS: JSON.stringify({ price_allowed: { name: 'Pro', entitlements: { api_calls: null }, labels: { api_calls: 'API calls' } } }) });
    const retrieve = jest.fn().mockResolvedValue({ unit_amount: unitAmount, currency: 'eur', recurring: interval ? { interval, interval_count: intervalCount } : null });
    jest.spyOn(service as never, 'stripe').mockReturnValue({ prices: { retrieve } } as never);
    await expect(service.configuration()).resolves.toMatchObject({ plans: [{ price: { unitAmount, currency: 'eur', interval, intervalCount }, labels: { api_calls: 'API calls' } }] });
    await service.configuration();
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledWith('price_allowed');
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 86_400_001);
    try { await service.configuration(); } finally { clock.mockRestore(); }
    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  it('returns null without contacting Stripe when credentials are absent', async () => {
    const { service } = setup({ STRIPE_PRICE_PLANS: '{"price_allowed":{"name":"Pro","entitlements":{}}}' });
    const stripe = jest.spyOn(service as never, 'stripe');
    await expect(service.configuration()).resolves.toMatchObject({ configured: false, plans: [{ price: null, labels: {} }] });
    expect(stripe).not.toHaveBeenCalled();
  });

  it.each([null, [], 'API calls', { unknown: 'Unknown' }, { api_calls: 3 }, { api_calls: null }])('rejects invalid labels %j', async (labels) => {
    const { service } = setup({ STRIPE_PRICE_PLANS: JSON.stringify({ price_allowed: { name: 'Pro', entitlements: { api_calls: null }, labels } }) });
    await expect(service.configuration()).rejects.toMatchObject({ code: 'INVALID_BILLING_CONFIGURATION' });
  });

  it('maps provider failures to the shared billing error instead of an internal error', async () => {
    const { service, customers } = setup({ STRIPE_SECRET_KEY: 'sk_test', STRIPE_WEBHOOK_SECRET: 'whsec_test', STRIPE_PRICE_PLANS: '{"price_allowed":{"name":"pro","entitlements":{}}}', FRONTEND_URL: 'https://app.example' });
    customers.findOneBy.mockResolvedValue({ providerCustomerId: 'cus_test' });
    const failure = new Error('Provider details must stay private');
    const stripe = {
      checkout: { sessions: { create: jest.fn().mockRejectedValue(failure) } },
      billingPortal: { sessions: { create: jest.fn().mockRejectedValue(failure) } },
    };
    (service as unknown as { stripe: () => unknown }).stripe = jest.fn(() => stripe);
    await expect(service.checkout('organization-1', 'price_allowed', 1, 'actor-1')).rejects.toMatchObject({ code: 'BILLING_PROVIDER_ERROR', statusCode: 502, message: 'The billing provider could not create Checkout.' });
    await expect(service.portal('organization-1', 'actor-1')).rejects.toMatchObject({ code: 'BILLING_PROVIDER_ERROR', statusCode: 502, message: 'The billing provider could not create the portal.' });
  });

  it('audits Checkout and Portal without provider object identifiers', async () => {
    const values = { STRIPE_SECRET_KEY: 'sk_test', STRIPE_WEBHOOK_SECRET: 'whsec_test', STRIPE_PRICE_PLANS: '{"price_allowed":{"name":"pro","entitlements":{}}}', FRONTEND_URL: 'https://app.example' };
    const { service, customers, audit } = setup(values);
    customers.findOneBy.mockResolvedValue({ organizationId: 'organization-1', provider: 'stripe', providerCustomerId: 'cus_secret' });
    const stripe = {
      checkout: { sessions: { create: jest.fn(async () => ({ id: 'cs_secret', url: 'https://checkout.example' })) } },
      billingPortal: { sessions: { create: jest.fn(async () => ({ id: 'bps_secret', url: 'https://portal.example' })) } },
    };
    (service as unknown as { stripe: () => unknown }).stripe = jest.fn(() => stripe);

    await service.checkout('organization-1', 'price_allowed', 2, 'actor-1');
    await service.portal('organization-1', 'actor-1');

    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      success_url: 'https://app.example/billing?organizationId=organization-1&checkout=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://app.example/billing?organizationId=organization-1&checkout=cancelled',
    }));
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      return_url: 'https://app.example/billing?organizationId=organization-1',
    }));

    expect(audit.record).toHaveBeenNthCalledWith(1, {
      organizationId: 'organization-1', actorUserId: 'actor-1', action: 'billing.checkout.created', targetType: 'billing',
      metadata: { provider: 'stripe', plan: 'pro', quantity: 2 },
    });
    expect(audit.record).toHaveBeenNthCalledWith(2, {
      organizationId: 'organization-1', actorUserId: 'actor-1', action: 'billing.portal.created', targetType: 'billing',
      metadata: { provider: 'stripe' },
    });
    expect(JSON.stringify(audit.record.mock.calls)).not.toMatch(/cus_secret|cs_secret|bps_secret/);
  });

  it('uses Stripe official signature verification over the unmodified raw body and deduplicates deliveries', async () => {
    const key = 'sk_test_123456789012345678901234'; const secret = 'whsec_test_secret';
    const { service, events } = setup({ STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: secret, STRIPE_PRICE_PLANS: '{"price_pro_monthly":{"name":"pro","entitlements":{}}}' });
    const payload = JSON.stringify({ id: 'evt_123', object: 'event', type: 'product.created', data: { object: {} } });
    const signature = new Stripe(key).webhooks.generateTestHeaderString({ payload, secret });
    events.findOneBy.mockResolvedValue({ id: 'known-event' });

    await expect(service.handleStripeWebhook(Buffer.from(payload), signature)).resolves.toEqual({ accepted: true, duplicate: true });
    await expect(service.handleStripeWebhook(Buffer.from(`${payload} `), signature)).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_SIGNATURE' });
  });

  it('retries a distinct event when another row causes a unique conflict', async () => {
    const key = 'sk_test_123456789012345678901234'; const secret = 'whsec_test_secret';
    const { service, events } = setup({ STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: secret });
    const payload = JSON.stringify({ id: 'evt_distinct', object: 'event', type: 'product.created', data: { object: {} } });
    const signature = new Stripe(key).webhooks.generateTestHeaderString({ payload, secret });
    const conflict = { code: '23505' };
    let attempts = 0;
    const apply = jest.fn(async () => { if (++attempts === 1) throw conflict; });
    (service as unknown as { applyStripeEvent: () => Promise<void> }).applyStripeEvent = apply;
    events.findOneBy.mockResolvedValue(null);
    events.save.mockImplementation(async (delivery) => delivery);

    await expect(service.handleStripeWebhook(Buffer.from(payload), signature)).rejects.toBe(conflict);
    expect(events.findOneBy).toHaveBeenCalledTimes(2);
    expect(events.findOneBy).toHaveBeenNthCalledWith(2, { provider: 'stripe', providerEventId: 'evt_distinct' });
    await expect(service.handleStripeWebhook(Buffer.from(payload), signature)).resolves.toEqual({ accepted: true, duplicate: false });
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('acknowledges an insert conflict only when the same event ID exists', async () => {
    const key = 'sk_test_123456789012345678901234'; const secret = 'whsec_test_secret';
    const { service, events } = setup({ STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: secret });
    const payload = JSON.stringify({ id: 'evt_same', object: 'event', type: 'product.created', data: { object: {} } });
    const signature = new Stripe(key).webhooks.generateTestHeaderString({ payload, secret });
    events.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce({ provider: 'stripe', providerEventId: 'evt_same' });
    events.save.mockRejectedValue({ code: '23505' });

    await expect(service.handleStripeWebhook(Buffer.from(payload), signature)).resolves.toEqual({ accepted: true, duplicate: true });
    expect(events.findOneBy).toHaveBeenNthCalledWith(2, { provider: 'stripe', providerEventId: 'evt_same' });
  });

  it('treats a portal cancellation with cancel_at as scheduled and notices each change once', async () => {
    const { service, customers, subscriptions, manager } = setup({ STRIPE_PRICE_PLANS: '{"price_allowed":{"name":"Pro mensual","entitlements":{"api_calls":100}}}' });
    const local: Record<string, unknown> = { organizationId: 'organization-1', providerSubscriptionId: 'sub_1', status: 'trialing', cancelAtPeriodEnd: false };
    const periodEnd = 1794528000; // 13 November 2026
    let state: Record<string, unknown> = {};
    customers.findOneBy.mockResolvedValue({ organizationId: 'organization-1', providerCustomerId: 'cus_ours' });
    subscriptions.findOneBy.mockResolvedValue(local);
    subscriptions.save.mockImplementation(async (value) => value);
    const stripe = { subscriptions: { retrieve: jest.fn(async () => ({ id: 'sub_1', customer: 'cus_ours', created: 10, metadata: {}, items: { data: [{ price: { id: 'price_allowed' }, current_period_end: periodEnd }] }, ...state })) } };
    (service as unknown as { stripe: () => unknown }).stripe = jest.fn(() => stripe);
    const sync = async (next: Record<string, unknown>) => {
      state = next;
      const notices: Array<{ key: string; date: Date | null }> = [];
      await (service as unknown as { syncStripeSubscription: (manager: unknown, event: unknown, notices: unknown[]) => Promise<void> })
        .syncStripeSubscription(manager, { id: 'sub_1', customer: 'cus_ours', metadata: {} }, notices);
      return notices.map(({ key, date }) => [key, date?.toISOString().slice(0, 10)]);
    };

    // The customer portal sets cancel_at and leaves cancel_at_period_end false.
    await expect(sync({ status: 'trialing', cancel_at_period_end: false, cancel_at: periodEnd })).resolves.toEqual([['subscription_cancellation_scheduled', '2026-11-13']]);
    expect(local.cancelAtPeriodEnd).toBe(true);
    await expect(sync({ status: 'trialing', cancel_at_period_end: false, cancel_at: periodEnd })).resolves.toEqual([]);
    await expect(sync({ status: 'trialing', cancel_at_period_end: false, cancel_at: null })).resolves.toEqual([['subscription_cancellation_reverted', '2026-11-13']]);
    expect(local.cancelAtPeriodEnd).toBe(false);
    await expect(sync({ status: 'active', cancel_at_period_end: true, cancel_at: periodEnd })).resolves.toEqual([['subscription_cancellation_scheduled', '2026-11-13']]);
    await expect(sync({ status: 'canceled', cancel_at_period_end: false, cancel_at: periodEnd, ended_at: periodEnd })).resolves.toEqual([['subscription_ended', '2026-11-13']]);
    await expect(sync({ status: 'canceled', cancel_at_period_end: false, cancel_at: periodEnd, ended_at: periodEnd })).resolves.toEqual([]);
  });

  it('emails subscription notices to billing members and only logs a failed delivery', async () => {
    const { service, organizations, members, secureEmail } = setup({ FRONTEND_URL: 'https://app.example.com' });
    organizations.findOneBy.mockResolvedValue({ id: 'organization-1', name: 'Acme' });
    members.getRawMany.mockResolvedValue([{ email: 'owner@example.com' }, { email: 'admin@example.com' }]);
    const send = (service as unknown as { sendNotices: (notices: unknown[]) => Promise<void> }).sendNotices.bind(service);

    await send([{ key: 'subscription_cancellation_scheduled', organizationId: 'organization-1', plan: 'Pro mensual', date: new Date(Date.UTC(2026, 10, 13)) }]);
    expect(members.andWhere).toHaveBeenCalledWith('membership.role IN (:...roles)', { roles: ['owner', 'admin'] });
    expect(secureEmail.send.mock.calls.map((call: unknown[]) => call[0])).toEqual(['owner@example.com', 'admin@example.com']);
    const [, subject, text, html] = secureEmail.send.mock.calls[0] as unknown as [string, string, string, string];
    expect(subject).toBe('Tu suscripción se cancelará el 13 de noviembre de 2026');
    expect(text).toContain('La suscripción Pro mensual de Acme se cancelará el 13 de noviembre de 2026');
    expect(html).toContain('https://app.example.com/billing');

    secureEmail.send.mockRejectedValueOnce(new Error('down'));
    await expect(send([{ key: 'subscription_ended', organizationId: 'organization-1', plan: 'Pro mensual', date: null }])).resolves.toBeUndefined();
  });

  it('replaces a canceled subscription and ignores delayed events from it', async () => {
    const { service, customers, subscriptions, entitlements, manager } = setup({ STRIPE_PRICE_PLANS: '{"price_allowed":{"name":"pro","entitlements":{"api_calls":100}}}' });
    const local = { organizationId: 'organization-1', providerSubscriptionId: 'sub_old', status: 'canceled' };
    const old = { id: 'sub_old', customer: 'cus_ours', created: 20, status: 'canceled', metadata: { organization_id: 'organization-1' } };
    const current = { id: 'sub_new', customer: 'cus_ours', created: 20, status: 'active', metadata: { organization_id: 'organization-1' }, cancel_at_period_end: false, items: { data: [{ price: { id: 'price_allowed' } }] } };
    customers.findOneBy.mockResolvedValue({ organizationId: 'organization-1', providerCustomerId: 'cus_ours' });
    subscriptions.findOneBy.mockResolvedValue(local);
    subscriptions.save.mockImplementation(async (value) => value);
    const stripe = { subscriptions: { retrieve: jest.fn(async (id: string) => id === 'sub_old' ? old : id === 'sub_foreign' ? { ...old, id } : current) } };
    (service as unknown as { stripe: () => unknown }).stripe = jest.fn(() => stripe);
    const sync = (event: unknown) => (service as unknown as { syncStripeSubscription: (manager: unknown, event: unknown) => Promise<void> }).syncStripeSubscription(manager, event);

    await sync(current);
    expect(local.providerSubscriptionId).toBe('sub_new');
    expect(local.status).toBe('active');
    expect(local).toMatchObject({ previousSubscriptionIds: ['sub_old'] });
    expect(entitlements.save).toHaveBeenCalledWith([expect.objectContaining({ source: 'pro', key: 'api_calls', limit: 100 })]);

    subscriptions.save.mockClear(); entitlements.save.mockClear();
    await sync(old);
    expect(subscriptions.save).not.toHaveBeenCalled();
    expect(entitlements.save).not.toHaveBeenCalled();

    // A tie remains safe after the replacement itself reaches a terminal state.
    local.status = 'canceled'; current.status = 'canceled';
    await sync(old);
    expect(subscriptions.save).not.toHaveBeenCalled();
    expect(entitlements.save).not.toHaveBeenCalled();
    await expect(sync({ ...old, id: 'sub_foreign' })).rejects.toMatchObject({ code: 'BILLING_SUBSCRIPTION_MISMATCH' });
  });

  it('rejects an active second subscription or a foreign Stripe customer', async () => {
    const { service, customers, subscriptions, manager } = setup();
    const local = { organizationId: 'organization-1', providerSubscriptionId: 'sub_old', status: 'active' };
    const old = { id: 'sub_old', customer: 'cus_ours', created: 10, status: 'active' };
    const current = { id: 'sub_new', customer: 'cus_ours', created: 20, status: 'active', metadata: { organization_id: 'organization-1' } };
    customers.findOneBy.mockResolvedValue({ organizationId: 'organization-1', providerCustomerId: 'cus_ours' });
    subscriptions.findOneBy.mockResolvedValue(local);
    const stripe = { subscriptions: { retrieve: jest.fn(async (id: string) => id === 'sub_old' ? old : current) } };
    (service as unknown as { stripe: () => unknown }).stripe = jest.fn(() => stripe);
    const sync = (event: unknown) => (service as unknown as { syncStripeSubscription: (manager: unknown, event: unknown) => Promise<void> }).syncStripeSubscription(manager, event);

    await expect(sync(current)).rejects.toMatchObject({ code: 'BILLING_SUBSCRIPTION_MISMATCH' });
    local.status = 'canceled'; old.status = 'canceled';
    stripe.subscriptions.retrieve.mockImplementation(async (id: string) => id === 'sub_old' ? old : { ...current, customer: 'cus_foreign' });
    await expect(sync(current)).rejects.toMatchObject({ code: 'BILLING_CUSTOMER_MISMATCH' });
    expect(subscriptions.save).not.toHaveBeenCalled();
  });
});
