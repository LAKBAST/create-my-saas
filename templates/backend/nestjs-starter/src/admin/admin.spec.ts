import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AdminModule } from './admin.module';
import { PlatformAdmin } from './platform-admin.entity';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';
import { Membership } from '../organizations/membership.entity';
import { Subscription } from '../billing/subscription.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { AppError } from '../common/errors/app.error';
import { configureApplication } from '../app.setup';
import { setPlatformAdmin, validateAdminCommand } from './manage-admin.service';

describe('Platform administration HTTP authorization and queries', () => {
  let app: INestApplication;
  let db: DataSource;
  const jwt = new JwtService({ secret: 'admin-tests-secret' });
  let admin: User;
  let ordinary: User;
  let unverified: User;
  let inactive: User;
  const token = (user: User) => `Bearer ${jwt.sign({ sub: user.id, type: 'access', jti: randomUUID() })}`;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot({ type: 'sqljs', synchronize: true, entities: [User, PlatformAdmin, Organization, Membership, Subscription] }), AdminModule],
    }).overrideGuard(JwtAuthGuard).useValue(new JwtAuthGuard(jwt, {
      findActiveById: async (id: string) => {
        const user = await db.getRepository(User).findOneBy({ id });
        if (!user?.isActive) throw new AppError('USER_INACTIVE', 'User inactive.', 401);
        return user;
      },
    } as UsersService)).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    db = app.get(DataSource);
    const users = db.getRepository(User);
    admin = await users.save(users.create({ email: 'admin@example.test', name: 'Admin', emailVerified: true, passwordHash: 'PASSWORD_SECRET' }));
    ordinary = await users.save(users.create({ email: 'owner@example.test', name: 'Owner', emailVerified: true }));
    unverified = await users.save(users.create({ email: 'unverified@example.test', name: 'Unverified', emailVerified: false }));
    inactive = await users.save(users.create({ email: 'inactive@example.test', name: 'Inactive', emailVerified: true, isActive: false }));
    await db.getRepository(PlatformAdmin).save([admin, unverified, inactive].map((u) => ({ userId: u.id })));
    const orgs = db.getRepository(Organization);
    const org = await orgs.save(orgs.create({ name: 'Example organization', slug: 'example-org' }));
    const members = db.getRepository(Membership);
    await members.save(members.create({ organizationId: org.id, userId: ordinary.id, role: 'admin' }));
    const subscriptions = db.getRepository(Subscription);
    await subscriptions.save(subscriptions.create({ organizationId: org.id, plan: 'pro', seats: 3, providerSubscriptionId: 'PROVIDER_SECRET', previousSubscriptionIds: ['OLD_SECRET'] }));
  });

  afterAll(async () => { await app?.close(); });

  it('rejects anonymous callers on every route and disables caching', async () => {
    for (const path of ['access', 'overview', 'users', 'organizations', 'subscriptions']) {
      const response = await request(app.getHttpServer()).get(`/admin/${path}`).expect(401);
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
  });

  it('does not confuse an organization admin with a platform admin', async () => {
    await request(app.getHttpServer()).get('/admin/access').set('Authorization', token(ordinary)).expect(200, { allowed: false, resources: ['users', 'organizations', 'subscriptions'] });
    for (const path of ['overview', 'users', 'organizations', 'subscriptions']) {
      const response = await request(app.getHttpServer()).get(`/admin/${path}`).set('Authorization', token(ordinary)).expect(403);
      expect(response.body.error.code).toBe('PLATFORM_ADMIN_REQUIRED');
    }
  });

  it('requires active users and verified emails even when a grant exists', async () => {
    await request(app.getHttpServer()).get('/admin/access').set('Authorization', token(unverified)).expect(200, { allowed: false, resources: ['users', 'organizations', 'subscriptions'] });
    await request(app.getHttpServer()).get('/admin/users').set('Authorization', token(unverified)).expect(403);
    await request(app.getHttpServer()).get('/admin/users').set('Authorization', token(inactive)).expect(401);
  });

  it('reports actual database totals and numeric subscription groups', async () => {
    const response = await request(app.getHttpServer()).get('/admin/overview?days=7').set('Authorization', token(admin)).expect(200);
    expect(response.body).toMatchObject({ periodDays: 7, totalUsers: 4, enabledUsers: 3, verifiedUsers: 3, newUsers: 4, totalOrganizations: 1, newOrganizations: 1, totalSubscriptions: 1, subscriptionsByPlan: [{ plan: 'pro', count: 1 }], subscriptionsByStatus: [{ status: 'active', count: 1 }] });
  });

  it('paginates deterministically, searches literally, and returns only public user columns', async () => {
    const response = await request(app.getHttpServer()).get('/admin/users?page=1&pageSize=1&search=ADMIN%40EXAMPLE').set('Authorization', token(admin)).expect(200);
    expect(response.body).toMatchObject({ total: 1, page: 1, pageSize: 1 });
    expect(Object.keys(response.body.items[0]).sort()).toEqual(['id', 'email', 'name', 'emailVerified', 'isActive', 'createdAt'].sort());
    expect(JSON.stringify(response.body)).not.toContain('PASSWORD_SECRET');
    const literal = await request(app.getHttpServer()).get('/admin/users?search=%25').set('Authorization', token(admin)).expect(200);
    expect(literal.body.total).toBe(0);
    const page = await request(app.getHttpServer()).get('/admin/users?page=2&pageSize=100').set('Authorization', token(admin)).expect(200);
    expect(page.body.items).toEqual([]);
    expect(page.body.total).toBe(4);
  });

  it('shows organization member counts and subscriptions without provider identifiers', async () => {
    const orgs = await request(app.getHttpServer()).get('/admin/organizations?search=example').set('Authorization', token(admin)).expect(200);
    expect(orgs.body.items[0]).toMatchObject({ name: 'Example organization', memberCount: 1 });
    const subs = await request(app.getHttpServer()).get('/admin/subscriptions?search=pro').set('Authorization', token(admin)).expect(200);
    expect(subs.body.items[0]).toMatchObject({ organizationName: 'Example organization', plan: 'pro', seats: 3, cancelAtPeriodEnd: false });
    expect(JSON.stringify(subs.body)).not.toContain('SECRET');
    expect(subs.body.items[0]).not.toHaveProperty('providerSubscriptionId');
    expect(subs.body.items[0]).not.toHaveProperty('previousSubscriptionIds');
  });

  it('bounds query parameters and rejects unknown filters', async () => {
    for (const path of ['users?page=0', 'users?page=10001', 'users?pageSize=101', 'users?pageSize=1.5', 'users?search=' + 'x'.repeat(121), 'overview?days=366', 'users?role=admin']) {
      await request(app.getHttpServer()).get(`/admin/${path}`).set('Authorization', token(admin)).expect(422);
    }
  });

  it('revokes access immediately even for an existing JWT', async () => {
    const header = token(admin);
    await request(app.getHttpServer()).get('/admin/access').set('Authorization', header).expect(200, { allowed: true, resources: ['users', 'organizations', 'subscriptions'] });
    await db.getRepository(PlatformAdmin).delete({ userId: admin.id });
    await request(app.getHttpServer()).get('/admin/access').set('Authorization', header).expect(200, { allowed: false, resources: ['users', 'organizations', 'subscriptions'] });
    await request(app.getHttpServer()).get('/admin/users').set('Authorization', header).expect(403);
  });

  it('only grants verified active accounts through the operator command, idempotently', async () => {
    await expect(setPlatformAdmin(db, 'grant', unverified.id)).rejects.toThrow('Only active');
    await expect(setPlatformAdmin(db, 'grant', inactive.id)).rejects.toThrow('Only active');
    await expect(setPlatformAdmin(db, 'grant', randomUUID())).rejects.toThrow('User not found');
    expect(() => validateAdminCommand('grant', 'not-a-uuid')).toThrow('Usage:');
    expect(() => validateAdminCommand('delete', admin.id)).toThrow('Usage:');
    expect(() => validateAdminCommand('grant', admin.id, ['extra'])).toThrow('Usage:');
    await setPlatformAdmin(db, 'grant', ordinary.id);
    await setPlatformAdmin(db, 'grant', ordinary.id);
    await request(app.getHttpServer()).get('/admin/access').set('Authorization', token(ordinary)).expect(200, { allowed: true, resources: ['users', 'organizations', 'subscriptions'] });
    expect(await db.getRepository(PlatformAdmin).countBy({ userId: ordinary.id })).toBe(1);
    await setPlatformAdmin(db, 'revoke', ordinary.id);
    await setPlatformAdmin(db, 'revoke', ordinary.id);
    await request(app.getHttpServer()).get('/admin/users').set('Authorization', token(ordinary)).expect(403);
  });
});
