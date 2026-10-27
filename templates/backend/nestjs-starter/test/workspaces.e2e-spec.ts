import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { randomBytes, createHash } from 'node:crypto';
import { jest } from '@jest/globals';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/app.setup';
import { SecureEmailService } from '../src/auth/secure-email.service';
import { AuthService } from '../src/auth/auth.service';
import { Organization } from '../src/organizations/organization.entity';
import { Membership } from '../src/organizations/membership.entity';
import { Invitation } from '../src/organizations/invitation.entity';
import { Subscription } from '../src/billing/subscription.entity';
import { User } from '../src/users/user.entity';
import { validateEnvironment } from '../src/config';

describe('Product models and private personal workspaces', () => {
  let app: INestApplication;
  let db: DataSource;
  let config: ConfigService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SecureEmailService).useValue({ send: async () => undefined }).compile();
    app = module.createNestApplication(); configureApplication(app); await app.init();
    db = app.get(DataSource); config = app.get(ConfigService);
  });
  afterEach(async () => { await app?.close(); });
  async function register(email = 'person@example.com') {
    const body = { email, name: 'Person', password: 'password123' };
    const created = await request(app.getHttpServer()).post('/auth/register').send(body).expect(201);
    const session = await request(app.getHttpServer()).post('/auth/login').send({ email, password: body.password }).expect(200);
    return { id: created.body.id as string, header: `Bearer ${session.body.accessToken}` };
  }
  async function bootstrap(header: string) {
    return request(app.getHttpServer()).post('/workspaces/bootstrap').set('Authorization', header).expect(200);
  }
  it('validates the model and preserves the teams default without personal creation', async () => {
    expect(() => validateEnvironment({ SECRET_KEY: 'test-secret', APP_ENV: 'test', PRODUCT_MODEL: 'unknown' })).toThrow('PRODUCT_MODEL');
    expect(validateEnvironment({ SECRET_KEY: 'test-secret', APP_ENV: 'test' }).PRODUCT_MODEL).toBe('teams');
    const user = await register();
    const context = await bootstrap(user.header);
    expect(context.body).toEqual({ model: 'teams', personalWorkspace: null, teams: [], billingSupported: true });
    expect(await db.getRepository(Organization).count()).toBe(0);
    await request(app.getHttpServer()).post('/workspaces/bootstrap').expect(401);
  });
  it('provisions personal billing at registration and forbids all team operations in individual mode', async () => {
    config.set('PRODUCT_MODEL', 'individual');
    const user = await register();
    expect(await db.getRepository(Organization).countBy({ personalOwnerUserId: user.id })).toBe(1);
    const first = await bootstrap(user.header);
    const again = await bootstrap(user.header);
    expect(again.body.personalWorkspace.id).toBe(first.body.personalWorkspace.id);
    expect(first.body.teams).toEqual([]);
    expect(first.headers['cache-control']).toContain('no-store');
    const id = first.body.personalWorkspace.id as string;
    await request(app.getHttpServer()).get(`/billing/organizations/${id}`).set('Authorization', user.header).expect(200);
    await request(app.getHttpServer()).post('/organizations').set('Authorization', user.header).send({ name: 'Forbidden team', slug: 'forbidden-team' }).expect(403);
    await request(app.getHttpServer()).post(`/organizations/${id}/invitations`).set('Authorization', user.header).send({ email: 'friend@example.com', role: 'member' }).expect(403);
    await request(app.getHttpServer()).post(`/organizations/${id}/ownership/transfer`).set('Authorization', user.header).send({ userId: user.id }).expect(403);
    await request(app.getHttpServer()).get(`/organizations/${id}/members`).set('Authorization', user.header).expect(403);
    await request(app.getHttpServer()).post('/users/me/deactivate').set('Authorization', user.header).expect(204);
  });
  it('keeps existing teams and personal subscriptions independent in mixed mode', async () => {
    const user = await register();
    const team = await request(app.getHttpServer()).post('/organizations').set('Authorization', user.header).send({ name: 'Existing team', slug: 'existing-team' }).expect(201);
    config.set('PRODUCT_MODEL', 'mixed');
    const context = await bootstrap(user.header);
    const personalId = context.body.personalWorkspace.id as string;
    expect(context.body.teams).toEqual([team.body]);
    expect((await bootstrap(user.header)).body.personalWorkspace.id).toBe(personalId);
    const subscriptions = db.getRepository(Subscription);
    await subscriptions.save(subscriptions.create({ organizationId: personalId, plan: 'personal-pro' }));
    await subscriptions.save(subscriptions.create({ organizationId: team.body.id, plan: 'team-pro' }));
    const personal = await request(app.getHttpServer()).get(`/billing/organizations/${personalId}`).set('Authorization', user.header).expect(200);
    const shared = await request(app.getHttpServer()).get(`/billing/organizations/${team.body.id}`).set('Authorization', user.header).expect(200);
    expect(personal.body.plan).toBe('personal-pro'); expect(shared.body.plan).toBe('team-pro');
    await request(app.getHttpServer()).post('/organizations').set('Authorization', user.header).send({ name: 'Reserved', slug: `personal-${user.id}` }).expect(400);
  });
  it('requires personal paid subscription cancellation before deactivation but allows scheduled cancellation', async () => {
    config.set('PRODUCT_MODEL', 'individual');
    const user = await register();
    const personalId = (await bootstrap(user.header)).body.personalWorkspace.id as string;
    const subscriptions = db.getRepository(Subscription);
    const subscription = await subscriptions.save(subscriptions.create({ organizationId: personalId, provider: 'stripe', providerSubscriptionId: 'sub_personal', plan: 'personal-pro', status: 'active' }));
    const denied = await request(app.getHttpServer()).post('/users/me/deactivate').set('Authorization', user.header).expect(409);
    expect(denied.body.error.code).toBe('ACTIVE_PERSONAL_SUBSCRIPTION');
    expect((await db.getRepository(User).findOneByOrFail({ id: user.id })).isActive).toBe(true);
    await subscriptions.update(subscription.id, { cancelAtPeriodEnd: true });
    await request(app.getHttpServer()).post('/users/me/deactivate').set('Authorization', user.header).expect(204);
  });
  it('preserves a legacy team occupying the newly reserved personal slug', async () => {
    const user = await register();
    const organizations = db.getRepository(Organization);
    const legacy = await organizations.save(organizations.create({ name: 'Legacy team', slug: `personal-${user.id}` }));
    const memberships = db.getRepository(Membership);
    await memberships.save(memberships.create({ organizationId: legacy.id, userId: user.id, role: 'owner' }));
    config.set('PRODUCT_MODEL', 'mixed');
    const context = await bootstrap(user.header);
    expect(context.body.personalWorkspace.slug).not.toBe(legacy.slug);
    expect(context.body.teams).toEqual([{ id: legacy.id, name: legacy.name, slug: legacy.slug }]);
    expect((await organizations.findOneByOrFail({ id: legacy.id })).personalOwnerUserId).toBeNull();
  });
  it('denies cross-user personal access even if a membership exists and rejects personal invitations', async () => {
    config.set('PRODUCT_MODEL', 'mixed');
    const owner = await register('owner@example.com'); const other = await register('other@example.com');
    const personalId = (await bootstrap(owner.header)).body.personalWorkspace.id as string;
    const memberships = db.getRepository(Membership);
    await memberships.save(memberships.create({ organizationId: personalId, userId: other.id, role: 'owner' }));
    await request(app.getHttpServer()).get(`/billing/organizations/${personalId}`).set('Authorization', other.header).expect(403);
    const token = randomBytes(30).toString('hex');
    const invitations = db.getRepository(Invitation);
    await invitations.save(invitations.create({ organizationId: personalId, email: 'other@example.com', role: 'member', tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 60000) }));
    await request(app.getHttpServer()).post('/organizations/invitations/accept').set('Authorization', other.header).send({ token }).expect(403);
    await request(app.getHttpServer()).post(`/organizations/${personalId}/invitations`).set('Authorization', owner.header).send({ email: 'friend@example.com', role: 'member' }).expect(403);
    const list = await request(app.getHttpServer()).get('/organizations').set('Authorization', other.header).expect(200);
    expect(list.body.some((workspace: { id: string }) => workspace.id === personalId)).toBe(false);
  });
  it('creates the personal workspace through the real OAuth user provisioning path', async () => {
    config.set('PRODUCT_MODEL', 'mixed'); config.set('OAUTH_ENABLED', true);
    config.set('OAUTH_GOOGLE_CLIENT_ID', 'test-client'); config.set('OAUTH_GOOGLE_CLIENT_SECRET', 'test-secret');
    config.set('OAUTH_GOOGLE_REDIRECT_URI', 'http://localhost:3000/auth/oauth/callback');
    const auth = app.get(AuthService);
    const exchange = jest.spyOn(auth as unknown as { exchangeOAuthProfile: (...args: unknown[]) => Promise<unknown> }, 'exchangeOAuthProfile')
      .mockResolvedValue({ email: 'oauth@example.com', name: 'OAuth Person', providerAccountId: 'oauth-subject' });
    try {
      const started = await auth.oauthStart('google');
      const state = new URL(started.authorizationUrl).searchParams.get('state')!;
      const logged = await auth.oauthCallback('google', state, 'test-code');
      const user = await db.getRepository(User).findOneByOrFail({ email: 'oauth@example.com' });
      expect(user.emailVerified).toBe(true);
      expect(await db.getRepository(Organization).countBy({ personalOwnerUserId: user.id })).toBe(1);
      expect((await bootstrap(`Bearer ${logged.authentication.accessToken}`)).body.personalWorkspace).not.toBeNull();
    } finally { exchange.mockRestore(); }
  });
});
