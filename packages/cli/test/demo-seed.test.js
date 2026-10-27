import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { seedDemo } from '../src/demo-seed.js';

function project(t, backend, model) {
  const root = mkdtempSync(join(tmpdir(), 'create-my-saas-seed-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'backend'));
  writeFileSync(join(root, '.gitignore'), '.env\n.env.*\n');
  writeFileSync(join(root, '.create-my-saas.json'), JSON.stringify({
    schemaVersion: 4, productModel: model, cliVersion: '1.8.0',
    templates: { backend: { id: `backend:${backend}`, version: '0.1.0', source: `templates/backend/${backend}-starter` } },
    features: [], extensions: [], files: {}, unmanaged: [],
  }));
  writeFileSync(join(root, 'backend', '.env'), `APP_ENV=development\nPRODUCT_MODEL=${model}\nDATABASE_URL=postgresql://postgres:postgres@localhost:5432/app\nEMAIL_DELIVERY_URL=\n`);
  return root;
}

function fakeApi(model) {
  const users = new Map();
  const teams = [];
  const calls = [];
  async function request(input, options = {}) {
    const path = new URL(input).pathname;
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ path, body, headers: options.headers ?? {} });
    const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
    if (path === '/ready') return json({ status: 'ready' });
    if (path === '/auth/register') {
      if (users.has(body.email)) return json({ code: 'EMAIL_ALREADY_EXISTS' }, 409);
      users.set(body.email, body.password);
      return json({ email: body.email }, 201);
    }
    if (path === '/auth/login') {
      return users.get(body.email) === body.password
        ? json({ accessToken: `token-${body.email}` }, 200, { 'set-cookie': 'refresh_token=opaque; Path=/auth, csrf_token=local-csrf; Path=/' })
        : json({ code: 'INVALID_CREDENTIALS' }, 401);
    }
    if (path === '/workspaces/bootstrap') return json({ model, personalWorkspace: model === 'teams' ? null : { id: 'personal-1' } });
    if (path === '/organizations' && options.method === 'POST') {
      const team = { id: 'team-1', name: body.name, slug: body.slug };
      teams.push(team);
      return json(team, 201);
    }
    if (path === '/organizations') return json(teams);
    throw new Error(`Unexpected request: ${path}`);
  }
  return { request, calls, teams, users };
}

for (const [backend, model] of [['fastapi', 'individual'], ['nestjs', 'mixed'], ['fastify', 'individual'], ['fastapi', 'teams']]) {
  test(`seed creates reusable demo accounts for ${backend} ${model}`, async (t) => {
    const root = project(t, backend, model);
    const api = fakeApi(model);
    const first = await seedDemo(root, { request: api.request });
    assert.equal(first.ownerEmail, 'demo-owner@example.com');
    assert.equal(first.memberEmail, 'demo-member@example.com');
    const secret = readFileSync(first.credentialsPath, 'utf8');
    assert.match(secret, /DEMO_PASSWORD=.+A1!/);
    assert.equal(api.users.size, 2);
    assert.equal(api.teams.length, model === 'individual' ? 0 : 1);
    assert.equal(Boolean(first.personalWorkspace), model !== 'teams');
    const second = await seedDemo(root, { request: api.request });
    assert.equal(readFileSync(first.credentialsPath, 'utf8'), secret);
    assert.equal(second.team?.id, first.team?.id);
    assert.equal(api.teams.length, model === 'individual' ? 0 : 1);
    assert.equal(api.calls.filter((call) => call.path === '/auth/register').length, 4);
    const bootstrap = api.calls.find((call) => call.path === '/workspaces/bootstrap');
    assert.equal(bootstrap.headers['X-CSRF-Token'], 'local-csrf');
    assert.match(bootstrap.headers.Authorization, /^Bearer token-/);
  });
}

test('seed refuses production mode, remote databases and configured mail delivery', async (t) => {
  const root = project(t, 'nestjs', 'teams');
  const path = join(root, 'backend', '.env');
  const base = readFileSync(path, 'utf8');
  const api = fakeApi('teams');
  for (const [content, message] of [
    [base.replace('APP_ENV=development', 'APP_ENV=production'), /APP_ENV=development/],
    [base.replace('@localhost:', '@db.example.com:'), /local PostgreSQL/],
    [`${base}EMAIL_DELIVERY_URL=https://mailer.example.com\n`, /Disable EMAIL_DELIVERY_URL/],
  ]) {
    writeFileSync(path, content);
    await assert.rejects(seedDemo(root, { request: api.request }), message);
  }
  assert.equal(api.calls.length, 0);
});

test('seed reports an unavailable API without creating credentials', async (t) => {
  const root = project(t, 'fastapi', 'teams');
  await assert.rejects(seedDemo(root, { request: async () => { throw new Error('offline'); } }), /Local API is unavailable/);
  assert.equal(readFileSync(join(root, '.gitignore'), 'utf8').includes('.env.*'), true);
});
