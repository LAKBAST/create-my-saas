import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { buildManifest, fileDigest, MANIFEST_FILE, normalizedFileContents, readManifest, writeManifest } from '../src/manifest.js';
import { defaultTemplatesDirectory, loadCatalog } from '../src/catalog.js';
import { generateProject } from '../src/generator.js';

const { version: cliVersion } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const options = { cliVersion, backend: 'fastapi', frontend: null, features: [], extensions: [] };
function workspace(t) {
  const directory = mkdtempSync(join(tmpdir(), 'cms-manifest-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function tree(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? tree(path, `${prefix}${entry.name}/`) : [[`${prefix}${entry.name}`, readFileSync(path)]];
  }).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
}

test('fileDigest normalizes CRLF but preserves lone CR, UTF-8 and BOM', () => {
  assert.equal(fileDigest(Buffer.from('á\r\nb\r\n')), fileDigest(Buffer.from('á\nb\n')));
  assert.notEqual(fileDigest(Buffer.from('a\rb')), fileDigest(Buffer.from('a\nb')));
  assert.equal(fileDigest(Buffer.from('\ufeffa\r\n')), createHash('sha256').update('\ufeffa\n').digest('hex'));
});

test('binary images, favicon and invalid UTF-8 are hashed byte for byte', () => {
  for (const bytes of [
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.from([0, 0, 1, 0, 13, 10]),
    Buffer.from([255, 216, 255, 13, 10]),
    Buffer.from([192, 175, 13, 10]),
    Buffer.from('GIF89a\r\n'),
    Buffer.from('BM\r\n'),
  ]) {
    assert.equal(fileDigest(bytes), createHash('sha256').update(bytes).digest('hex'));
    assert.deepEqual(normalizedFileContents(bytes), bytes);
  }
});

test('manifest sorts paths and features, omits itself and stores no source paths', (t) => {
  const directory = workspace(t);
  writeFileSync(join(directory, 'z.txt'), 'z\r\n');
  mkdirSync(join(directory, 'a'));
  writeFileSync(join(directory, 'a', 'b.txt'), 'b\n');
  writeFileSync(join(directory, MANIFEST_FILE), 'old manifest');
  const manifest = buildManifest(directory, { ...options, features: ['z', 'a'], extensions: [{ id: 'test:example', directory: 'example', schemaVersion: 1, sourceDirectory: directory }] });
  assert.deepEqual(Object.keys(manifest.files), ['a/b.txt', 'z.txt']);
  assert.deepEqual(manifest.features, ['a', 'z']);
  assert.equal(manifest.schemaVersion, 3);
  assert.equal('backend' in manifest, false);
  assert.equal('frontend' in manifest, false);
  assert.deepEqual(manifest.extensions, [{ id: 'test:example', version: null, source: 'example', manifestSchemaVersion: 1 }]);
  assert.equal(JSON.stringify(manifest).includes(directory), false);
  writeManifest(directory, manifest);
  assert.equal(readFileSync(join(directory, MANIFEST_FILE), 'utf8'), `${JSON.stringify(manifest, null, 2)}\n`);
  assert.deepEqual(readManifest(directory), manifest);
});

test('readManifest returns null only for absent manifests and rejects invalid schemas clearly', (t) => {
  const directory = workspace(t);
  assert.equal(readManifest(directory), null);
  const valid = buildManifest(directory, options);
  const invalid = [null, [], {}, { ...valid, schemaVersion: 1 }, { ...valid, schemaVersion: 2 }, { ...valid, cliVersion: '' },
    { ...valid, templates: {} }, { ...valid, templates: [] },
    { ...valid, templates: { wrong: valid.templates.backend } },
    ...[{ id: 'fastapi' }, { id: 'frontend:fastapi' }, { version: 2 }, { source: '/absolute/path' }, { source: '../outside' }]
      .map((changes) => ({ ...valid, templates: { backend: { ...valid.templates.backend, ...changes } } })),
    { ...valid, backend: null }, { ...valid, frontend: null }, { ...valid, features: ['z', 'a'] }, { ...valid, features: [2] },
    { ...valid, extensions: [{ id: 'test:x' }] }, { ...valid, extensions: [{ id: 'test:x', version: 2 }] },
    { ...valid, files: [] }, { ...valid, files: { 'x.txt': 'wrong' } },
    ...['../x', '/x', 'C:/x', 'a\\x', 'a//x', './x', MANIFEST_FILE].map((path) => ({ ...valid, files: { [path]: 'a'.repeat(64) } })),
    { ...valid, unmanaged: ['../x'] }, { ...valid, extra: true }];
  for (const manifest of invalid) {
    writeManifest(directory, manifest);
    assert.throws(() => readManifest(directory), /Invalid \.create-my-saas\.json:/);
  }
  for (const key of Object.keys(valid)) {
    const missing = { ...valid };
    delete missing[key];
    writeManifest(directory, missing);
    assert.throws(() => readManifest(directory), /Invalid \.create-my-saas\.json:/, key);
  }
  writeFileSync(join(directory, MANIFEST_FILE), '{');
  assert.throws(() => readManifest(directory), /malformed JSON/);
});

test('readManifest normalizes schema 2 manifests from projects generated before 1.6.0', (t) => {
  const directory = workspace(t);
  const templates = { backend: { id: 'backend:fastapi', version: '0.1.0', source: 'backend/fastapi-starter' } };
  writeFileSync(join(directory, MANIFEST_FILE), JSON.stringify({ schemaVersion: 2, templates }));
  assert.deepEqual(readManifest(directory), { schemaVersion: 2, cliVersion: null, templates, features: [], extensions: [], files: null, unmanaged: [] });
  // Pro bundles keep each extension at the root of its directory, so its source is ''.
  const extensions = [{ id: 'pro:api-keys', version: '1.1.0', source: '', manifestSchemaVersion: 1 }];
  writeFileSync(join(directory, MANIFEST_FILE), JSON.stringify({ schemaVersion: 2, templates, extensions }));
  assert.deepEqual(readManifest(directory).features, ['pro:api-keys']);
  writeFileSync(join(directory, MANIFEST_FILE), JSON.stringify({ schemaVersion: 2, templates, files: {} }));
  assert.throws(() => readManifest(directory), /unexpected manifest field/);
  const v3 = buildManifest(directory, { ...options, extensions: [{ id: 'pro:api-keys', version: '1.1.0', directory: '', schemaVersion: 1 }] });
  writeManifest(directory, v3);
  assert.equal(readManifest(directory).extensions[0].source, '');
});

test('v3 extends v2 template and extension metadata without dropping legacy fields', (t) => {
  const directory = workspace(t);
  const templates = {
    backend: { id: 'backend:fastapi', version: '0.1.0', source: 'backend/fastapi-starter' },
    frontend: { id: 'frontend:nextjs', version: '0.1.0', source: 'frontend/nextjs-starter' },
  };
  const extensions = [{ id: 'pro:example', version: '1.2.3', source: 'external/example', manifestSchemaVersion: 1 }];
  const manifest = buildManifest(directory, { cliVersion, templates, extensions });
  assert.deepEqual(manifest.templates, templates);
  assert.deepEqual(manifest.extensions, extensions);
  assert.equal(manifest.schemaVersion, 3);
  assert.deepEqual(Object.keys(manifest).sort(), ['schemaVersion', 'templates', 'extensions', 'cliVersion', 'features', 'files', 'unmanaged'].sort());
  writeManifest(directory, manifest);
  assert.deepEqual(readManifest(directory), manifest);
});

const catalog = loadCatalog();
for (const backend of [null, ...catalog.backend]) {
  for (const frontend of [null, ...catalog.frontend]) {
    if (!backend && !frontend) continue;
    if (backend && frontend && (frontend.compatibility?.requiresBackendCapabilities ?? []).some((capability) => !backend.capabilities.includes(capability))) continue;
    test(`reproducible complete tree and manifest: ${backend?.key ?? 'none'} / ${frontend?.key ?? 'none'}`, (t) => {
      const root = workspace(t);
      const destinations = [join(root, 'first'), join(root, 'different-parent', 'different-name')];
      for (const destination of destinations) generateProject({ destination, backendId: backend?.key, frontendId: frontend?.key });
      assert.deepEqual(tree(destinations[0]), tree(destinations[1]));
      const manifest = readManifest(destinations[0]);
      assert.equal(manifest.cliVersion, cliVersion);
      const legacyTemplates = {};
      for (const [kind, template] of [['backend', backend], ['frontend', frontend]]) {
        if (template) legacyTemplates[kind] = { id: template.id, version: template.version, source: template.directory };
      }
      assert.deepEqual(manifest.templates, legacyTemplates);
      assert.equal('backend' in manifest, false);
      assert.equal('frontend' in manifest, false);
      const files = tree(destinations[0]).filter(([path]) => path !== MANIFEST_FILE);
      assert.deepEqual(Object.keys(manifest.files), files.map(([path]) => path));
      for (const [path, contents] of files) {
        assert.equal(manifest.files[path], fileDigest(contents), path);
        assert.deepEqual(contents, normalizedFileContents(contents), path);
      }
      for (const path of ['.gitignore', 'THIRD_PARTY_NOTICES.md', 'deployment/compose.yaml']) assert.ok(manifest.files[path], path);
    });
  }
}

test('templates and extension overlays reproduce across CRLF, LF, source modes and umasks', (t) => {
  const root = workspace(t);
  const sources = [join(root, 'lf'), join(root, 'crlf')];
  const binary = Buffer.from([0, 0, 1, 0, 13, 10]);
  for (const [index, source] of sources.entries()) {
    const templates = join(source, 'templates');
    cpSync(defaultTemplatesDirectory, templates, {
      recursive: true,
      filter: (path) => !new Set(['node_modules', '.venv', '.next', '.pytest_cache', '.ruff_cache', '.uv-validation-cache', '__pycache__', '.astro', '.react-router', 'dist', 'build', 'coverage']).has(basename(path)),
    });
    const extension = join(source, 'extensions', 'example');
    mkdirSync(join(extension, 'overlay'), { recursive: true });
    writeFileSync(join(extension, 'extension.manifest.json'), JSON.stringify({
      schemaVersion: 1, id: 'test:example', aliases: ['example'], version: '1.0.0', displayName: 'Example', description: 'Reproducibility fixture.',
      provides: [], requires: { cli: '^1.0.0', capabilities: [], extensions: [] }, conflictsWith: [],
      supportedStacks: [{ backend: { id: 'backend:fastapi', version: '^0.2.0' } }],
      targets: [{ template: 'backend:fastapi', overlay: 'overlay', replace: [], migrations: [], environment: [
        { name: 'APP_ENV', value: 'development', secret: false, description: 'Keep the existing development value.' },
        { name: 'EXAMPLE_SECRET', value: '', secret: true, description: 'Set your own unique secret before starting the application.' },
      ] }],
    }));
    writeFileSync(join(extension, 'overlay', 'example.sh'), '#!/bin/sh\necho example\n');
    writeFileSync(join(extension, 'overlay', 'example.ico'), binary);
    for (const [path, contents] of tree(source)) {
      const normalized = normalizedFileContents(contents);
      if (index === 1 && normalized.equals(contents) && !contents.includes(0) && !path.endsWith('.ico')) {
        writeFileSync(join(source, path), normalized.toString('utf8').replaceAll('\n', '\r\n'));
      }
      chmodSync(join(source, path), index === 0 ? 0o644 : 0o755);
    }
  }
  const destinations = sources.map((_, index) => join(root, `generated-${index}`));
  for (const [index, source] of sources.entries()) {
    const previous = process.umask(index === 0 ? 0o022 : 0o077);
    try {
      generateProject({ destination: destinations[index], backendId: 'fastapi', templatesDirectory: join(source, 'templates'), extensionsDirectories: [join(source, 'extensions')], featureIds: ['example'] });
    } finally { process.umask(previous); }
  }
  assert.deepEqual(tree(destinations[0]), tree(destinations[1]));
  const manifest = readManifest(destinations[0]);
  assert.deepEqual(manifest.features, ['example']);
  assert.deepEqual(manifest.extensions, [{ id: 'test:example', version: '1.0.0', source: 'example', manifestSchemaVersion: 1 }]);
  assert.equal(manifest.files['backend/example.ico'], fileDigest(binary));
  assert.equal(manifest.files['backend/example.sh'], fileDigest(Buffer.from('#!/bin/sh\necho example\n')));
  assert.deepEqual(readFileSync(join(destinations[0], 'backend', 'example.ico')), binary);
  assert.match(readFileSync(join(destinations[0], 'backend', '.env.example'), 'utf8'), /^EXAMPLE_SECRET=$/m);
  if (process.platform !== 'win32') {
    for (const destination of destinations) {
      assert.equal(statSync(join(destination, 'backend', 'example.sh')).mode & 0o777, 0o755);
      assert.equal(statSync(join(destination, MANIFEST_FILE)).mode & 0o777, 0o644);
      assert.equal(statSync(destination).mode & 0o777, 0o755);
    }
  }
});
