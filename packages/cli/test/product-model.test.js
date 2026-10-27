import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseArguments } from '../src/cli.js';
import { generateProject } from '../src/generator.js';
import { readManifest } from '../src/manifest.js';
import { readProjectManifest, upgradeProject } from '../src/upgrade.js';

function workspace(t) {
  const directory = mkdtempSync(join(tmpdir(), 'create-my-saas-model-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('parses product model in both CLI forms and rejects missing values', () => {
  assert.equal(parseArguments(['app', '--product-model', 'individual']).productModel, 'individual');
  assert.equal(parseArguments(['app', '--product-model=mixed']).productModel, 'mixed');
  assert.throws(() => parseArguments(['app', '--product-model']), /Missing value/);
});

for (const backendId of ['fastapi', 'nestjs']) for (const productModel of ['individual', 'teams', 'mixed']) {
  test(`persists ${backendId} ${productModel} in generation, runtime and upgrade metadata`, (t) => {
    const destination = join(workspace(t), 'app');
    generateProject({ destination, backendId, frontendId: 'nextjs', productModel });
    const manifest = readManifest(destination);
    assert.equal(manifest.schemaVersion, 4);
    assert.equal(manifest.productModel, productModel);
    assert.equal(readProjectManifest(destination).productModel, productModel);
    for (const path of ['backend/.env.example', 'deployment/.env.production.example']) {
      assert.match(readFileSync(join(destination, path), 'utf8'), new RegExp(`^PRODUCT_MODEL=${productModel}$`, 'm'));
    }
    assert.match(readFileSync(join(destination, 'deployment/nginx.conf'), 'utf8'), /\(auth\|users\|workspaces\|/);
  });
}

test('preserves teams as the default and restricts Fastify to individual accounts', (t) => {
  const directory = workspace(t);
  generateProject({ destination: join(directory, 'teams'), backendId: 'nestjs' });
  assert.equal(readManifest(join(directory, 'teams')).productModel, 'teams');
  generateProject({ destination: join(directory, 'individual'), backendId: 'fastify', frontendId: 'astro' });
  assert.equal(readManifest(join(directory, 'individual')).productModel, 'individual');
  for (const productModel of ['teams', 'mixed']) assert.throws(() => generateProject({ destination: join(directory, `fastify-${productModel}`), backendId: 'fastify', productModel }), /does not support/);
  assert.throws(() => generateProject({ destination: join(directory, 'invalid'), backendId: 'fastapi', productModel: 'other' }), /Unknown product model/);
  assert.throws(() => generateProject({ destination: join(directory, 'no-api'), frontendId: 'astro', productModel: 'individual' }), /requires a backend/);
});

test('upgrade keeps a selected model and migrates legacy metadata without changing the model', (t) => {
  const directory = workspace(t);
  for (const productModel of ['individual', 'teams', 'mixed']) {
    const destination = join(directory, productModel);
    generateProject({ destination, backendId: 'nestjs', productModel });
    const observed = [];
    const generate = ({ destination, productModel, ...selection }) => {
      observed.push(productModel);
      generateProject({ destination, productModel, ...selection });
    };
    upgradeProject({ projectDirectory: destination, allowDirty: true, generateBase: generate, generateCurrent: generate });
    assert.deepEqual(observed, [productModel, productModel]);
    assert.equal(readManifest(destination).productModel, productModel);
  }
  const legacy = join(directory, 'legacy');
  generateProject({ destination: legacy, backendId: 'nestjs' });
  const file = join(legacy, '.create-my-saas.json');
  const metadata = JSON.parse(readFileSync(file, 'utf8'));
  metadata.schemaVersion = 3;
  delete metadata.productModel;
  writeFileSync(file, JSON.stringify(metadata));
  assert.equal(readProjectManifest(legacy).productModel, undefined);
  upgradeProject({ projectDirectory: legacy, allowDirty: true, generateBase: generateProject, generateCurrent: generateProject });
  assert.equal(readManifest(legacy).productModel, 'teams');
});
