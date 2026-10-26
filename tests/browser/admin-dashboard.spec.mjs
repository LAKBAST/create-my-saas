import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';

// These tests exercise the browser's permission states, request contract and
// rendering. Authorization and query isolation are tested against the Nest API
// separately; intercepted responses are not evidence of backend authorization.
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'owner@example.test',
  name: 'Platform operator',
  email_verified: true,
  is_active: true,
};
const overview = {
  periodDays: 30,
  totalUsers: 26,
  enabledUsers: 24,
  verifiedUsers: 20,
  newUsers: 7,
  totalOrganizations: 3,
  newOrganizations: 1,
  totalSubscriptions: 2,
  subscriptionsByStatus: [{ status: 'active', count: 2 }],
  subscriptionsByPlan: [{ plan: 'pro', count: 2 }],
};

async function mockSession(page, initial = {}) {
  const state = { allowed: true, unsupported: false, revoked: false, empty: false, failUsers: false, requests: [], ...initial };
  await page.route('**/auth/refresh', (route) => route.fulfill({
    json: { accessToken: 'admin-ui-test-token', user },
  }));
  await page.route('**/users/me', (route) => route.fulfill({ json: user }));
  await page.route('**/api/admin/**', async (route) => {
    const url = new URL(route.request().url());
    state.requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) });
    if (state.unsupported) return route.fulfill({ status: 404, json: { error: { code: 'HTTP_404' } } });
    if (url.pathname.endsWith('/access')) return route.fulfill({ json: { allowed: state.allowed && !state.revoked, resources: state.resources } });
    if (state.revoked) return route.fulfill({ status: 403, json: { error: { code: 'PLATFORM_ADMIN_REQUIRED' } } });
    if (state.failUsers && url.pathname.endsWith('/users')) return route.fulfill({ status: 503, json: { error: { code: 'SERVICE_NOT_READY' } } });
    if (url.pathname.endsWith('/overview')) return route.fulfill({
      json: { ...overview, ...(state.resources?.length === 1 ? { totalOrganizations: null, newOrganizations: null, totalSubscriptions: null, subscriptionsByPlan: [], subscriptionsByStatus: [] } : {}), periodDays: Number(url.searchParams.get('days') ?? 30) },
    });
    const pageNumber = Number(url.searchParams.get('page') ?? 1);
    const pageSize = Number(url.searchParams.get('pageSize') ?? 25);
    const search = url.searchParams.get('search') ?? '';
    let items = [];
    let total = 1;
    if (url.pathname.endsWith('/users')) {
      total = search ? 1 : 26;
      items = [{
        id: `user-${pageNumber}`, name: search ? 'Filtered customer' : pageNumber === 1 ? 'First customer' : 'Second page customer',
        email: search ? 'filtered@example.test' : `customer${pageNumber}@example.test`,
        emailVerified: true, isActive: true, createdAt: '2026-10-01T09:00:00.000Z',
      }];
    } else if (url.pathname.endsWith('/organizations')) {
      items = [{ id: 'org-1', name: 'Example company', slug: 'example-company', memberCount: 4, createdAt: '2026-10-01T09:00:00.000Z' }];
    } else if (url.pathname.endsWith('/subscriptions')) {
      items = [{
        id: 'sub-1', organizationId: 'org-1', organizationName: 'Example company', plan: 'pro', status: 'active',
        seats: 4, provider: 'stripe', cancelAtPeriodEnd: false,
        currentPeriodStart: '2026-10-01T00:00:00.000Z', currentPeriodEnd: '2026-11-01T00:00:00.000Z',
      }];
    } else return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: { items: state.empty ? [] : items, total: state.empty ? 0 : total, page: pageNumber, pageSize } });
  });
  return state;
}

test('ordinary accounts have no admin navigation and cannot load global data', async ({ page }) => {
  const state = await mockSession(page, { allowed: false });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tu base de producto' })).toBeVisible();
  await expect.poll(() => state.requests.some((request) => request.path.endsWith('/access'))).toBe(true);
  await expect(page.getByRole('link', { name: /Administración/ })).toHaveCount(0);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible();
  expect(state.requests.filter((request) => !request.path.endsWith('/access'))).toEqual([]);
});

test('admins can consult statistics, paginate, search and switch datasets', async ({ page }) => {
  const state = await mockSession(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Administración global' })).toBeVisible();
  await expect(page.getByText('First customer', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.getByText('Second page customer', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar usuarios', exact: true }).fill('filtered');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByText('Filtered customer', { exact: true })).toBeVisible();
  expect(state.requests.some((request) => request.query.search === 'filtered' && request.query.page === '1')).toBe(true);
  await page.getByRole('combobox', { name: 'Periodo de altas', exact: true }).selectOption('7');
  await expect.poll(() => state.requests.some((request) => request.path.endsWith('/overview') && request.query.days === '7')).toBe(true);
  await page.getByRole('button', { name: 'Organizaciones', exact: true }).click();
  await expect(page.getByText('Example company', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Suscripciones', exact: true }).click();
  await expect(page.getByText('Example company', { exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('pro');
  await mkdir('.tmp', { recursive: true });
  await page.evaluate(() => new Promise((resolve) => { window.scrollTo(0, 0); requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
  await page.screenshot({ path: '.tmp/admin-dashboard-desktop.png', fullPage: true });
});

test('revoking permission removes previously rendered global data', async ({ page }) => {
  const state = await mockSession(page);
  await page.goto('/admin');
  await expect(page.getByText('First customer', { exact: true })).toBeVisible();
  state.revoked = true;
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible();
  await expect(page.getByText('First customer', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Administración/ })).toHaveCount(0);
});

test('an unsupported backend explains availability without querying datasets', async ({ page }) => {
  const state = await mockSession(page, { unsupported: true });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Administración no disponible' })).toBeVisible();
  expect(state.requests.filter((request) => !request.path.endsWith('/access'))).toEqual([]);
  await expect(page.getByRole('link', { name: /Administración/ })).toHaveCount(0);
});

test('a users-only backend hides unavailable resources instead of inventing totals', async ({ page }) => {
  const state = await mockSession(page, { resources: ['users'] });
  await page.goto('/admin');
  await expect(page.getByText('First customer', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Organizaciones', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Suscripciones', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Suscripciones por plan' })).toHaveCount(0);
  expect(state.requests.some((request) => /\/(organizations|subscriptions)$/.test(request.path))).toBe(false);
});

test('the dashboard fits a phone viewport and keeps tables within their scroller', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSession(page);
  await page.goto('/admin');
  await expect(page.getByText('First customer', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await mkdir('.tmp', { recursive: true });
  await page.evaluate(() => new Promise((resolve) => { window.scrollTo(0, 0); requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
  await page.screenshot({ path: '.tmp/admin-dashboard-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await expect(page.getByRole('link', { name: /Administración/ })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar menú', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Buscar usuarios', exact: true })).toBeVisible();
});

test('a failed list can be retried and an empty result replaces previous records', async ({ page }) => {
  const state = await mockSession(page, { failUsers: true });
  await page.goto('/admin');
  await expect(page.getByRole('region', { name: 'Usuarios', exact: true }).getByRole('alert')).toContainText('temporalmente');
  await expect(page.getByRole('table')).toHaveCount(0);
  state.failUsers = false;
  await page.getByRole('button', { name: 'Reintentar consulta', exact: true }).click();
  await expect(page.getByText('First customer', { exact: true })).toBeVisible();
  state.empty = true;
  await page.getByRole('searchbox', { name: 'Buscar usuarios', exact: true }).fill('absent');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByText('No hay usuarios para esta consulta.', { exact: true })).toBeVisible();
  await expect(page.getByText('First customer', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Siguiente', exact: true })).toBeDisabled();
});

test('the real Next rewrite forwards admin credentials while preserving the page route', async ({ request }) => {
  const received = [];
  const upstream = createServer((incoming, response) => {
    received.push({ path: incoming.url, authorization: incoming.headers.authorization });
    if (incoming.url !== '/admin/access') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
    });
    response.end(JSON.stringify({ allowed: true }));
  });
  await new Promise((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(3208, '127.0.0.1', resolve);
  });
  try {
    // No browser route interception: this passes through next.config.ts to the
    // local upstream and checks that the API cannot shadow the /admin page.
    const response = await request.get('/api/admin/access', { headers: { authorization: 'Bearer rewrite-test-token' } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ allowed: true });
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(received).toEqual([{ path: '/admin/access', authorization: 'Bearer rewrite-test-token' }]);
    const page = await request.get('/admin');
    expect(page.status()).toBe(200);
    expect(page.headers()['content-type']).toContain('text/html');
    expect(await page.text()).toContain('<html');
    expect(received).toHaveLength(1);
  } finally {
    await new Promise((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
  }
});
