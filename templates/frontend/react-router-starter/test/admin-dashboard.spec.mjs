import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';

const user = { id: '00000000-0000-4000-8000-000000000001', name: 'Operator', email: 'operator@example.test', email_verified: true, is_active: true };

async function session(page, options = {}) {
  const state = { allowed: true, resources: ['users', 'organizations', 'subscriptions'], revoked: false, calls: [], ...options };
  await page.route('**/auth/refresh', (route) => route.fulfill({ json: { accessToken: 'ui-test-token', user } }));
  await page.route('**/api/admin/**', (route) => {
    const url = new URL(route.request().url());
    state.calls.push(url);
    const resource = url.pathname.split('/').at(-1);
    if (resource === 'access') return route.fulfill({ json: { allowed: state.allowed && !state.revoked, resources: state.resources } });
    if (state.revoked) return route.fulfill({ status: 403, json: { error: { code: 'PLATFORM_ADMIN_REQUIRED' } } });
    if (resource === 'overview') return route.fulfill({ json: {
      periodDays: Number(url.searchParams.get('days') ?? 30), totalUsers: 26, enabledUsers: 24, verifiedUsers: 20, newUsers: 3,
      totalOrganizations: state.resources.includes('organizations') ? 2 : null, newOrganizations: state.resources.includes('organizations') ? 1 : null,
      totalSubscriptions: state.resources.includes('subscriptions') ? 2 : null,
      subscriptionsByStatus: [{ status: 'active', count: 2 }], subscriptionsByPlan: [{ plan: 'pro', count: 2 }],
    } });
    const pageNumber = Number(url.searchParams.get('page') ?? 1);
    const search = url.searchParams.get('search') ?? '';
    const items = resource === 'users' ? [{ id: `user-${pageNumber}`, name: search ? 'Filtered person' : `Person page ${pageNumber}`, email: 'person@example.test', emailVerified: true, isActive: true, createdAt: '2026-10-01T09:00:00Z' }]
      : resource === 'organizations' ? [{ id: 'org-1', name: 'Example team', slug: 'example-team', memberCount: 4, createdAt: '2026-10-01T09:00:00Z' }]
      : [{ id: 'sub-1', organizationId: 'org-1', organizationName: 'Example team', plan: 'pro', status: 'active', provider: 'stripe', seats: 4, cancelAtPeriodEnd: false, currentPeriodStart: null, currentPeriodEnd: null }];
    return route.fulfill({ json: { items, total: search ? 1 : 26, page: pageNumber, pageSize: 25 } });
  });
  return state;
}

test('organization accounts without a global grant cannot load global records', async ({ page }) => {
  const state = await session(page, { allowed: false });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Administración', exact: true })).toHaveCount(0);
  expect(state.calls.every((url) => url.pathname.endsWith('/access'))).toBe(true);
});

test('global administrators can search, paginate, switch data and lose access after revocation', async ({ page }) => {
  const state = await session(page);
  await page.goto('/admin');
  await expect(page.getByText('Person page 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Administración', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.getByText('Person page 2', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar usuarios', exact: true }).fill('filter');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByText('Filtered person', { exact: true })).toBeVisible();
  expect(state.calls.some((url) => url.searchParams.get('search') === 'filter' && url.searchParams.get('page') === '1')).toBe(true);
  await page.getByRole('button', { name: 'Organizaciones', exact: true }).click();
  await expect(page.getByText('Example team', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Suscripciones', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('pro');
  state.revoked = true;
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Administración', exact: true })).toHaveCount(0);
});

test('a users-only backend hides unavailable data and fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await session(page, { resources: ['users'] });
  await page.goto('/admin');
  await expect(page.getByText('Person page 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Organizaciones', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Suscripciones', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Organizaciones', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Suscripciones por plan', exact: true })).toHaveCount(0);
  expect(state.calls.some((url) => /\/(organizations|subscriptions)$/.test(url.pathname))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('the real proxy preserves authorization, query and cache headers without capturing the UI page', async ({ request }) => {
  const calls = [];
  const server = createServer((incoming, response) => {
    calls.push({ path: incoming.url, authorization: incoming.headers.authorization });
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'private, no-store' });
    response.end(JSON.stringify({ allowed: true, resources: ['users'] }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3218, '127.0.0.1', resolve); });
  try {
    const response = await request.get('/api/admin/access?probe=1', { headers: { authorization: 'Bearer proxy-test-token' } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ allowed: true, resources: ['users'] });
    expect(response.headers()['cache-control']).toBe('private, no-store');
    expect(calls).toEqual([{ path: '/admin/access?probe=1', authorization: 'Bearer proxy-test-token' }]);
    const page = await request.get('/admin');
    expect(page.status()).toBe(200);
    expect(page.headers()['content-type']).toContain('text/html');
    expect(calls).toHaveLength(1);
  } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
