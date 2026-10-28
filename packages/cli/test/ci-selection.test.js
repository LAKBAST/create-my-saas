import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../../..');

function output(script, files) {
  const result = execFileSync(process.execPath, [script, ...files], { cwd: root, encoding: 'utf8' });
  return Object.fromEntries(result.trim().split(/\r?\n/).map((line) => line.split(/=(.*)/s).slice(0, 2)));
}

test('local setup changes keep generated-template jobs empty', () => {
  const result = output('.github/scripts/affected-jobs.mjs', ['packages/cli/src/cli.js', 'packages/cli/src/local-setup.js', 'packages/cli/src/demo-seed.js', 'packages/cli/test/local-setup.test.js', 'packages/cli/test/demo-seed.test.js']);
  assert.deepEqual(JSON.parse(result.generated_projects), []);
  assert.deepEqual(JSON.parse(result.generated_e2e), []);
  assert.equal(result.fastapi, 'false');
  assert.equal(result.nestjs, 'false');
});

test('demo seed changes select the supported backend contracts only', () => {
  const result = output('.github/scripts/affected-product-models.mjs', ['packages/cli/src/demo-seed.js']);
  assert.deepEqual(JSON.parse(result.matrix).map((entry) => entry.backend), ['fastapi', 'nestjs', 'fastapi', 'fastify']);
});

test('a backend change selects only combinations using that backend', () => {
  const result = output('.github/scripts/affected-jobs.mjs', ['templates/backend/fastify-starter/src/auth/service.ts']);
  assert.ok(JSON.parse(result.generated_e2e).every((entry) => entry.backend === 'fastify'));
  assert.equal(result.fastify, 'true');
  assert.equal(result.fastapi, 'false');
});

test('model-contract jobs select only combinations touched by a template', () => {
  const result = output('.github/scripts/affected-product-models.mjs', ['templates/backend/nestjs-starter/src/workspaces/service.ts']);
  assert.deepEqual(JSON.parse(result.matrix), [{ backend: 'nestjs', frontend: 'react-router', product_model: 'mixed' }]);
  const docs = output('.github/scripts/affected-product-models.mjs', ['templates/backend/nestjs-starter/README.md']);
  assert.deepEqual(JSON.parse(docs.matrix), []);
});

test('shared API types select frontend combinations without backend starter jobs', () => {
  const result = output('.github/scripts/affected-jobs.mjs', ['templates/shared/api-contract.ts']);
  assert.equal(result.fastapi, 'false');
  assert.equal(result.nestjs, 'false');
  assert.equal(result.fastify, 'false');
  assert.equal(result.nextjs, 'true');
  assert.equal(result.astro, 'true');
  const models = output('.github/scripts/affected-product-models.mjs', ['templates/shared/api-contract.ts']);
  assert.equal(JSON.parse(models.matrix).length, 4);
});
