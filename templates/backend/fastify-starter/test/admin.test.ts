import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { SessionRepository, StoredUser } from '../src/types.js';
import type { AdminRepository } from '../src/admin/repository.js';

test('global administration authenticates, checks persisted grants and exposes only supported resources', async () => {
  const user: StoredUser = { id: '00000000-0000-4000-8000-000000000001', name: 'Operator', email: 'operator@example.test',
    passwordHash: 'SECRET', emailVerified: true, isActive: true, createdAt: new Date().toISOString() };
  let grant = false;
  let queried = false;
  const sessions = {
    findActiveSessionByAccessHash: async () => ({ userId: user.id }),
    findUserById: async () => user,
  } as unknown as SessionRepository;
  const adminRepository: AdminRepository = {
    hasGrant: async () => grant,
    overview: async () => ({ totalUsers: 1, enabledUsers: 1, verifiedUsers: 1, newUsers: 1 }),
    users: async () => { queried = true; return { items: [user], total: 1 }; },
  };
  const config = loadConfig({ APP_ENV: 'test', DATABASE_URL: 'postgres://localhost/test', FRONTEND_URL: 'http://localhost:3000',
    CORS_ORIGINS: 'http://localhost:3000', SECRET_KEY: 'admin-test-secret-with-at-least-32-characters', RATE_LIMIT_ENABLED: 'false' });
  const app = await createApp({ config, repository: sessions, adminRepository, databaseReady: async () => {} });
  const headers = { authorization: 'Bearer valid-session' };
  try {
    for (const path of ['access', 'overview', 'users', 'organizations', 'subscriptions']) {
      const anonymous = await app.inject({ method: 'GET', url: `/admin/${path}` });
      assert.equal(anonymous.statusCode, 401);
      assert.equal(anonymous.headers['cache-control'], 'private, no-store');
    }
    const access = await app.inject({ method: 'GET', url: '/admin/access', headers });
    assert.deepEqual(access.json(), { allowed: false, resources: ['users'] });
    assert.equal((await app.inject({ method: 'GET', url: '/admin/users', headers })).statusCode, 403);
    const workspace = await app.inject({ method: 'POST', url: '/workspaces/bootstrap', headers });
    assert.equal(workspace.statusCode, 200);
    assert.deepEqual(workspace.json(), { model: 'individual', personalWorkspace: null, teams: [], billingSupported: false });
    assert.equal(workspace.headers['cache-control'], 'private, no-store');
    assert.equal((await app.inject({ method: 'POST', url: '/workspaces/bootstrap' })).statusCode, 401);
    for (const model of ['teams', 'mixed']) assert.throws(() => loadConfig({ APP_ENV: 'test',
      DATABASE_URL: 'postgres://localhost/test', FRONTEND_URL: 'http://localhost:3000',
      CORS_ORIGINS: 'http://localhost:3000', SECRET_KEY: 'test-secret-with-at-least-32-characters', PRODUCT_MODEL: model }), /PRODUCT_MODEL/);
    assert.equal(queried, false);
    grant = true;
    user.emailVerified = false;
    assert.equal((await app.inject({ method: 'GET', url: '/admin/users', headers })).statusCode, 403);
    user.emailVerified = true;
    user.isActive = false;
    assert.equal((await app.inject({ method: 'GET', url: '/admin/users', headers })).statusCode, 401);
    user.isActive = true;
    const users = await app.inject({ method: 'GET', url: '/admin/users?search=operator&pageSize=1', headers });
    assert.equal(users.statusCode, 200);
    assert.equal(users.json().total, 1);
    assert.equal(users.json().items[0].passwordHash, undefined);
    const overview = (await app.inject({ method: 'GET', url: '/admin/overview?days=7', headers })).json();
    assert.equal(overview.periodDays, 7);
    assert.equal(overview.totalOrganizations, null);
    assert.equal(overview.totalSubscriptions, null);
    assert.equal((await app.inject({ method: 'GET', url: '/admin/subscriptions', headers })).statusCode, 404);
    for (const path of ['users?pageSize=101', 'users?page=10001', 'users?extra=1', 'overview?days=366']) {
      assert.equal((await app.inject({ method: 'GET', url: `/admin/${path}`, headers })).statusCode, 400);
    }
    grant = false;
    assert.equal((await app.inject({ method: 'GET', url: '/admin/users', headers })).statusCode, 403);
  } finally { await app.close(); }
});
