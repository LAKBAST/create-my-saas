import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import test from 'node:test';
import { generateProject } from '../src/generator.js';

// Fixtures require the CLI under test; the extensions.nestjs capability gates the feature.
const { version: packageVersion } = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'nestjs-integrations-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const extensions = join(root, 'extensions');
  mkdirSync(extensions);
  function add(name, integration) {
    const directory = join(extensions, name);
    const files = {
      [`src/${name}/feature.module.ts`]: 'export class FeatureModule {}',
      [`src/${name}/record.entity.ts`]: 'export class RecordEntity {}',
      [`src/database/migrations/1800000000000-${name}.ts`]: 'export class AddRecords1800000000000 {}',
    };
    for (const [path, content] of Object.entries(files)) {
      const target = join(directory, 'backend', path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    const manifest = {
      schemaVersion: 1, id: 'community:' + name, version: '1.0.0', displayName: name,
      description: 'Generic integration fixture.', provides: [],
      requires: { cli: `^${packageVersion}`, capabilities: ['extensions.nestjs'], extensions: [] },
      supportedStacks: [{ backend: { id: 'backend:nestjs', version: '^0.2.0' } }],
      targets: [{ template: 'backend:nestjs', overlay: 'backend', replace: [], environment: [],
        migrations: [`src/database/migrations/1800000000000-${name}.ts`] }],
      integrations: { nestjs: integration ?? {
        modules: [`src/${name}/feature.module:FeatureModule`],
        entities: [`src/${name}/record.entity:RecordEntity`],
        migrations: [`src/database/migrations/1800000000000-${name}:AddRecords1800000000000`],
        auditActions: [{ name: name + '.recorded', metadata: ['roles'], stringListMetadata: ['roles'] }],
      } },
    };
    writeFileSync(join(directory, 'extension.manifest.json'), JSON.stringify(manifest));
  }
  const destination = join(root, 'project');
  return { root, destination, add, generate: (features) => generateProject({ destination,
    backendId: 'nestjs', frontendId: 'nextjs', featureIds: features.map((name) => 'community:' + name),
    extensionsDirectories: [extensions] }) };
}

test('composes two NestJS integrations without replacing shared template files', (t) => {
  const f = fixture(t);
  f.add('documents'); f.add('notifications');
  f.generate(['notifications', 'documents']);
  const generated = (path) => readFileSync(join(f.destination, 'backend', path), 'utf8');
  for (const path of ['src/app.module.ts', 'src/database/data-source.ts', 'src/database/database.module.ts', 'src/audit/audit-log.service.ts']) {
    assert.equal(generated(path), readFileSync(new URL('../../../templates/backend/nestjs-starter/' + path, import.meta.url), 'utf8').replaceAll('\r\n', '\n'));
  }
  const modules = generated('src/extensions/modules.generated.ts');
  assert.match(modules, /documents\/feature.module/);
  assert.match(modules, /notifications\/feature.module/);
  const database = generated('src/extensions/database.generated.ts');
  assert.match(database, /documents\/record.entity/);
  assert.match(database, /notifications\/record.entity/);
  assert.match(database, /1800000000000-documents/);
  assert.match(database, /1800000000000-notifications/);
  const audit = generated('src/extensions/audit.generated.ts');
  assert.match(audit, /documents.recorded/);
  assert.match(audit, /notifications.recorded/);
  assert.match(audit, /stringListMetadata/);
  assert.doesNotMatch(audit, /import.*feature.module/);
});

test('generates empty registries with no selected extensions', (t) => {
  const f = fixture(t); f.generate([]);
  assert.match(readFileSync(join(f.destination, 'backend/src/extensions/modules.generated.ts'), 'utf8'), /= \[\];/);
});

for (const [label, integration, error] of [
  ['path traversal', { modules: ['src/../outside:Bad'] }, /Invalid extension manifest/],
  ['code injection', { modules: ["src/foo:Bad'; process.exit(1)"] }, /Invalid extension manifest/],
  ['file extension', { modules: ['src/documents/feature.module.ts:FeatureModule'] }, /Invalid extension manifest/],
  ['unlisted string arrays', { auditActions: [{ name: 'document.created', metadata: [], stringListMetadata: ['roles'] }] }, /Invalid extension manifest/],
  ['missing source', { modules: ['src/missing:MissingModule'] }, /source does not exist/],
  ['undeclared migration', { migrations: ['src/documents/record.entity:RecordEntity'] }, /migration must be declared/],
]) {
  test('rejects ' + label + ' atomically', (t) => {
    const f = fixture(t); f.add('documents', integration);
    assert.throws(() => f.generate(['documents']), error);
    assert.equal(existsSync(f.destination), false);
  });
}

for (const [integration, error] of [
  [{ modules: ['src/documents/feature.module:FeatureModule'] }, /Duplicate NestJS modules/],
  [{ entities: ['src/documents/record.entity:RecordEntity'] }, /Duplicate NestJS entities/],
  [{ auditActions: [{ name: 'shared.recorded', metadata: [] }] }, /Duplicate NestJS audit action/],
]) {
  test('rejects duplicate contributions: ' + error.source, (t) => {
    const f = fixture(t); f.add('documents', integration); f.add('notifications', integration);
    assert.throws(() => f.generate(['documents', 'notifications']), error);
    assert.equal(existsSync(f.destination), false);
  });
}
