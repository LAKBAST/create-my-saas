import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { doctorProject, setupLocal } from '../src/local-setup.js';
import { run } from '../src/cli.js';

function project(t, { backendId, frontendId, productModel }) {
  const root = mkdtempSync(join(tmpdir(), 'create-my-saas-local-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const templates = {};
  if (backendId) {
    mkdirSync(join(root, 'backend'));
    templates.backend = { id: `backend:${backendId}`, version: '0.1.0', source: `templates/backend/${backendId}-starter` };
    writeFileSync(join(root, 'backend', '.env.example'), `APP_ENV=development\nPRODUCT_MODEL=${productModel}\nDATABASE_URL=postgresql://example/app\nREDIS_URL=redis://example\nSECRET_KEY=replace-with-a-long-random-secret\n`);
  }
  if (frontendId) {
    mkdirSync(join(root, 'frontend'));
    templates.frontend = { id: `frontend:${frontendId}`, version: '0.1.0', source: `templates/frontend/${frontendId}-starter` };
    const publicName = { nextjs: 'NEXT_PUBLIC_SITE_URL', 'react-router': 'VITE_PUBLIC_SITE_URL', astro: 'PUBLIC_SITE_URL' }[frontendId];
    writeFileSync(join(root, 'frontend', '.env.example'), `API_PROXY_TARGET=\n${publicName}=https://example.com\n`);
  }
  mkdirSync(join(root, 'deployment'));
  writeFileSync(join(root, '.gitignore'), '.env\n.env.*\n');
  writeFileSync(join(root, '.create-my-saas.json'), JSON.stringify({
    schemaVersion: backendId ? 4 : 3, ...(backendId ? { productModel } : {}), cliVersion: '1.8.0',
    templates, features: [], extensions: [], files: {}, unmanaged: [],
  }));
  return root;
}

for (const selection of [
  { backendId: 'fastapi', frontendId: 'nextjs', productModel: 'individual' },
  { backendId: 'nestjs', frontendId: 'react-router', productModel: 'mixed' },
  { backendId: 'fastify', frontendId: 'astro', productModel: 'individual' },
  { frontendId: 'astro' },
]) {
  test(`local setup preserves existing configuration for ${selection.backendId ?? 'static'} + ${selection.frontendId}`, async (t) => {
    const destination = project(t, selection);
    const first = setupLocal(destination);
    assert.equal(first.created.length, selection.backendId ? 3 : 2);
    assert.equal(first.preserved.length, 0);
    const second = setupLocal(destination);
    assert.equal(second.created.length, 0);
    assert.equal(second.preserved.length, first.created.length);
    const frontend = readFileSync(join(destination, 'frontend', '.env'), 'utf8');
    assert.match(frontend, /http:\/\/localhost:3000/);
    if (selection.backendId) {
      const backend = readFileSync(join(destination, 'backend', '.env'), 'utf8');
      const deployment = readFileSync(join(destination, 'deployment', '.env'), 'utf8');
      const secret = backend.match(/^SECRET_KEY=(.+)$/m)?.[1];
      assert.ok(secret?.length >= 64);
      assert.ok(deployment.includes(`SECRET_KEY=${secret}`));
      assert.match(backend, /DATABASE_URL=postgresql(?:\+asyncpg)?:\/\/postgres:postgres@localhost:5432\/app/);
      assert.match(backend, new RegExp(`^PRODUCT_MODEL=${selection.productModel ?? 'individual'}$`, 'm'));
    }
    const doctor = await doctorProject(destination, { services: false });
    assert.equal(doctor.ok, true, JSON.stringify(doctor.checks));
    assert.equal(await run(['doctor', destination, '--no-services'], { log: () => {}, error: () => {} }), 0);
  });
}

test('doctor reports service reachability without revealing credentials', async (t) => {
  const destination = project(t, { backendId: 'fastify', frontendId: 'astro', productModel: 'individual' });
  setupLocal(destination);
  const calls = [];
  const result = await doctorProject(destination, { probe: async (host, port) => { calls.push([host, port]); return false; } });
  assert.equal(result.ok, false);
  assert.deepEqual(calls, [['localhost', 5432], ['localhost', 6379]]);
  assert.equal(result.checks.filter((check) => !check.ok).length, 2);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_KEY=[^"\\]+/);
});

test('setup never overwrites a pre-existing secret or copies a production environment', (t) => {
  const destination = project(t, { backendId: 'nestjs', frontendId: 'nextjs', productModel: 'teams' });
  const backendPath = join(destination, 'backend', '.env');
  writeFileSync(backendPath, 'APP_ENV=development\nSECRET_KEY=existing-local-secret-with-at-least-32-characters\n', 'utf8');
  setupLocal(destination);
  assert.equal(readFileSync(backendPath, 'utf8'), 'APP_ENV=development\nSECRET_KEY=existing-local-secret-with-at-least-32-characters\n');
  assert.match(readFileSync(join(destination, 'deployment', '.env'), 'utf8'), /SECRET_KEY=existing-local-secret/);
  writeFileSync(backendPath, 'APP_ENV=production\nSECRET_KEY=production-value\n', 'utf8');
  assert.throws(() => setupLocal(destination), /not a development configuration/);
});
