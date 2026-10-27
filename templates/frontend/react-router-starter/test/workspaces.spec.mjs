import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';

const personal = { id: 'personal-1', name: 'Internal personal space', slug: 'personal-1' };
const team = { id: 'team-1', name: 'Team One', slug: 'team-one' };
async function mock(page, model, teams = [], legacy = false) {
  const requests = [];
  await page.route('**/auth/refresh', route => route.fulfill({ json: { accessToken: 'workspace-test', user: { id: 'user-1', name: 'Customer', email: 'customer@example.test', email_verified: true, is_active: true } } }));
  await page.route('**/api/admin/access', route => route.fulfill({ json: { allowed: false } }));
  await page.route('**/workspaces/bootstrap', route => {
    requests.push({ path: '/workspaces/bootstrap', method: route.request().method(), headers: route.request().headers() });
    return route.fulfill({ status: legacy ? 404 : 200, json: legacy ? {} : { model, personalWorkspace: model === 'teams' ? null : personal, teams, billingSupported: true } });
  });
  await page.route('**/organizations', route => {
    requests.push({ path: '/organizations', method: route.request().method() });
    return route.fulfill({ json: route.request().method() === 'POST' ? { id: 'team-created', name: 'New Team', slug: 'new-team' } : teams });
  });
  await page.route(/\/(organizations\/[^/]+\/billing\/|billing\/organizations\/)/, route => {
    const url = new URL(route.request().url()); requests.push({ path: url.pathname, method: route.request().method() });
    const id = url.pathname.startsWith('/organizations/') ? url.pathname.split('/')[2] : url.pathname.split('/')[3];
    if (url.pathname.endsWith('/configuration')) return route.fulfill({ json: { configured: true, plans: [{ priceId: 'price_pro', name: 'Pro', entitlements: {}, labels: {}, price: null }] } });
    if (url.pathname.endsWith('/checkout') || url.pathname.endsWith('/portal')) return route.fulfill({ json: { url: null, reason: 'Checkout requested' } });
    return route.fulfill({ json: { organizationId: id, provider: 'manual', plan: id === personal.id ? 'Personal Free' : 'Team Free', status: 'active', seats: 1, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, entitlements: [], usage: [] } });
  });
  return requests;
}

test('individual starts with a personal subscription without organization setup', async ({ page }) => {
  const requests = await mock(page, 'individual');
  await page.goto('/billing');
  await expect(page.getByRole('heading', { name: 'Plan actual: Personal Free' })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Crea tu organización' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Crear un equipo', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Elegir este plan' }).click();
  await expect.poll(() => requests.some(r => r.path.includes('/personal-1/') && r.path.endsWith('/checkout'))).toBe(true);
  expect(requests.filter(r => r.path === '/organizations')).toEqual([]);
  expect(requests.find(r => r.path === '/workspaces/bootstrap')?.method).toBe('POST');
});

test('mixed keeps personal and team subscriptions separate and can add a team', async ({ page }) => {
  const requests = await mock(page, 'mixed', [team]);
  await page.goto('/billing');
  await expect(page.getByRole('heading', { name: 'Plan actual: Personal Free' })).toBeVisible();
  await expect(page.getByText('Tu plan personal y el de cada equipo se contratan y cancelan por separado.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Espacio de facturación' }).selectOption(team.id);
  await expect(page.getByRole('heading', { name: 'Plan actual: Team Free' })).toBeVisible();
  await page.getByRole('button', { name: 'Elegir este plan' }).click();
  await expect.poll(() => requests.some(r => r.path.includes('/team-1/') && r.path.endsWith('/checkout'))).toBe(true);
  await page.getByRole('button', { name: 'Crear un equipo', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nombre de la organización' }).fill('New Team');
  await page.getByRole('button', { name: 'Crear organización', exact: true }).click();
  await expect(page.getByRole('combobox')).toHaveValue('team-created');
  await expect(page.getByRole('option', { name: 'Personal', exact: true })).toHaveCount(1);
});

test('teams preserves organization setup and legacy backends remain compatible', async ({ page }) => {
  await mock(page, 'teams', [], true);
  await page.goto('/billing');
  await expect(page.getByRole('heading', { name: 'Crea tu organización' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Nombre de la organización' }).fill('New Team');
  await page.getByRole('button', { name: 'Crear organización', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plan actual: Team Free' })).toBeVisible();
});

test('bootstrap proxy preserves POST, authentication and CSRF headers', async ({ request }) => {
  let incoming;
  const server = createServer((req, res) => {
    incoming = { path: req.url, method: req.method, auth: req.headers.authorization, csrf: req.headers['x-csrf-token'] };
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'private, no-store' });
    res.end(JSON.stringify({ model: 'individual', personalWorkspace: personal, teams: [], billingSupported: true }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(process.env.WORKSPACE_TEST_UPSTREAM_PORT), '127.0.0.1', resolve); });
  try {
    const response = await request.post('/workspaces/bootstrap', { headers: { authorization: 'Bearer workspace-test', 'x-csrf-token': 'test-csrf' } });
    expect(response.status()).toBe(200);
    expect((await response.json()).model).toBe('individual');
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(incoming).toEqual({ path: '/workspaces/bootstrap', method: 'POST', auth: 'Bearer workspace-test', csrf: 'test-csrf' });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
