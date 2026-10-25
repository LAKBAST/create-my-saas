import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as module from 'node:module';
import { test } from 'node:test';
import { Script, createContext } from 'node:vm';

const sources = [
  'templates/frontend/nextjs-starter/app/lib/api.ts',
  'templates/frontend/react-router-starter/app/lib/api.client.ts',
  'extensions/community-astro-billing/overlays/frontend/src/scripts/auth.ts',
];
class ApiError extends Error {
  constructor(status) { super(`HTTP ${status}`); this.status = status; }
}
function load(path, handler) {
  const source = readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
  const start = source.indexOf('type BillingRoutes =');
  const end = source.indexOf('\n}', source.indexOf('async function billingRequest', start)) + 2;
  assert.ok(start >= 0 && end > start, `Missing billing request in ${path}`);
  const context = createContext({ request: handler, ApiError });
  new Script(module.stripTypeScriptTypes(source.slice(start, end))).runInContext(context);
  return (...args) => context.billingRequest(...args);
}

for (const path of sources) {
  test(`${path}: billing route detection`, { skip: !module.stripTypeScriptTypes }, async (t) => {
    await t.test('concurrent FastAPI requests share exactly one failing route probe', async () => {
      const calls = [];
      const request = load(path, async (url) => {
        calls.push(url);
        await new Promise((resolve) => setImmediate(resolve));
        if (url.startsWith('/organizations/')) throw new ApiError(404);
        return url;
      });
      const results = await Promise.all(Array.from({ length: 8 }, (_, i) => request('valid', i % 2 ? 'subscription' : 'configuration', 'token')));
      assert.equal(results.length, 8);
      assert.equal(calls.filter((url) => url.startsWith('/organizations/')).length, 1);
      await request('other', 'configuration', 'token');
      assert.equal(calls.length, 10);
      assert.ok(calls.at(-1).startsWith('/billing/organizations/other'));
    });
    await t.test('NestJS is remembered without probing FastAPI', async () => {
      const calls = [];
      const request = load(path, async (url) => { calls.push(url); return url; });
      await Promise.all([request('valid', 'configuration', 'token'), request('valid', 'subscription', 'token')]);
      assert.equal(calls.length, 2);
      assert.ok(calls.every((url) => url.startsWith('/organizations/')));
    });
    await t.test('waiters retry detection after the first request fails', async () => {
      let first = true;
      const calls = [];
      const request = load(path, async (url) => {
        calls.push(url);
        await new Promise((resolve) => setImmediate(resolve));
        if (first) { first = false; throw new ApiError(503); }
        if (url.startsWith('/organizations/')) throw new ApiError(404);
        return url;
      });
      const results = await Promise.allSettled(Array.from({ length: 5 }, () => request('valid', 'configuration', 'token')));
      assert.deepEqual(results.map((result) => result.status), ['rejected', 'fulfilled', 'fulfilled', 'fulfilled', 'fulfilled']);
      assert.equal(calls.filter((url) => url.startsWith('/organizations/')).length, 2);
    });
    await t.test('a missing organization does not cache a wrong route', async () => {
      const calls = [];
      const request = load(path, async (url) => {
        calls.push(url);
        if (url.includes('/missing/') || url.startsWith('/billing/')) throw new ApiError(404);
        return url;
      });
      await assert.rejects(request('missing', 'configuration', 'token'), { status: 404 });
      await request('valid', 'configuration', 'token');
      await request('valid', 'subscription', 'token');
      assert.equal(calls.length, 4);
      assert.equal(calls.at(-1), '/organizations/valid/billing/subscription');
    });
  });
}
