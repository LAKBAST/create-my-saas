import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseUpgradeArguments, run } from '../src/cli.js';
import { generateProject } from '../src/generator.js';
import { formatUpgradeSummary, readProjectManifest, upgradeProject } from '../src/upgrade.js';

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** A backend template whose files are given as { path: content }. */
function templates(root, files) {
  const backend = join(root, 'backend', 'test-backend');
  mkdirSync(backend, { recursive: true });
  // The catalog needs a frontend template even when a project only uses the backend.
  const frontend = join(root, 'frontend', 'test-frontend');
  mkdirSync(frontend, { recursive: true });
  writeJson(join(frontend, 'template.manifest.json'), {
    schemaVersion: 1, id: 'frontend:test-frontend', kind: 'frontend', version: '1.0.0', displayName: 'Test frontend', capabilities: [],
  });
  writeJson(join(backend, 'template.manifest.json'), {
    schemaVersion: 1, id: 'backend:test-backend', kind: 'backend', version: '1.0.0', displayName: 'Test backend',
    capabilities: ['auth.password'], development: { baseUrl: 'http://localhost:8000' },
  });
  writeFileSync(join(backend, '.env.example'), 'APP_ENV=development\n', 'utf8');
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(backend, path, '..'), { recursive: true });
    writeFileSync(join(backend, path), content, 'utf8');
  }
  return root;
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function setup(t) {
  const workspace = mkdtempSync(join(tmpdir(), 'create-my-saas-upgrade-test-'));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const before = templates(join(workspace, 'v1'), {
    'server.js': 'export const port = 8000;\n',
    'app.js': 'line one\nline two\nline three\nline four\nline five\n',
    'conflict.js': 'export const value = 1;\n',
    'gone.js': 'removed later\n',
    'gone-edited.js': 'removed later\n',
    'crlf.js': 'a\nb\n',
    'custom.js': 'base\n',
  });
  const after = templates(join(workspace, 'v2'), {
    'server.js': 'export const port = Number(process.env.PORT ?? 8000);\n',
    'app.js': 'line one\nline two\nline three\nline four\nline five, from the template\n',
    'conflict.js': 'export const value = 2;\n',
    'new.js': 'added in v2\n',
    'crlf.js': 'a\nb\nc\n',
    'custom.js': 'template change\n',
  });
  const project = join(workspace, 'project');
  generateProject({ destination: project, backendId: 'test-backend', templatesDirectory: before, extensionsDirectories: [] });
  const options = {
    projectDirectory: project,
    fromVersion: '1.0.0',
    generateBase: ({ destination, ...selection }) => generateProject({ ...selection, destination, templatesDirectory: before, extensionsDirectories: [] }),
    generateCurrent: ({ destination, ...selection }) => generateProject({ ...selection, destination, templatesDirectory: after, extensionsDirectories: [] }),
  };
  return { project, options };
}

function commitAll(project) {
  git(project, 'init', '-q');
  git(project, '-c', 'core.autocrlf=false', 'add', '-A');
  git(project, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-qm', 'generated');
}

test('upgrade updates untouched files, merges edits and reports conflicts', (t) => {
  const { project, options } = setup(t);
  const file = (path) => join(project, 'backend', path);
  writeFileSync(file('app.js'), 'line one, edited by me\nline two\nline three\nline four\nline five\n');
  writeFileSync(file('conflict.js'), 'export const value = 10;\n');
  writeFileSync(file('gone-edited.js'), 'I still use this\n');
  writeFileSync(file('crlf.js'), 'a\r\nb\r\n');
  writeFileSync(file('mine.js'), 'not from the template\n');
  const manifest = JSON.parse(readFileSync(join(project, '.create-my-saas.json'), 'utf8'));
  writeJson(join(project, '.create-my-saas.json'), { ...manifest, unmanaged: ['backend/custom.js'] });
  commitAll(project);

  const result = upgradeProject(options);
  const actions = Object.fromEntries(result.plan.map((entry) => [entry.path, entry.action]));
  assert.deepEqual(actions, {
    'backend/app.js': 'merged',
    'backend/conflict.js': 'conflict',
    'backend/crlf.js': 'updated',
    'backend/custom.js': 'skipped',
    'backend/gone-edited.js': 'kept',
    'backend/gone.js': 'removed',
    'backend/new.js': 'added',
    'backend/server.js': 'updated',
  });
  assert.equal(readFileSync(file('server.js'), 'utf8'), 'export const port = Number(process.env.PORT ?? 8000);\n');
  assert.equal(readFileSync(file('app.js'), 'utf8'), 'line one, edited by me\nline two\nline three\nline four\nline five, from the template\n');
  assert.match(readFileSync(file('conflict.js'), 'utf8'), /^<<<<<<< tu versión\nexport const value = 10;\n=======\nexport const value = 2;\n>>>>>>> nueva plantilla\n$/);
  assert.equal(readFileSync(file('crlf.js'), 'utf8'), 'a\r\nb\r\nc\r\n', 'keeps the user\'s line endings');
  assert.equal(readFileSync(file('new.js'), 'utf8'), 'added in v2\n');
  assert.equal(existsSync(file('gone.js')), false);
  assert.equal(readFileSync(file('gone-edited.js'), 'utf8'), 'I still use this\n');
  assert.equal(readFileSync(file('custom.js'), 'utf8'), 'base\n');
  assert.equal(readFileSync(file('mine.js'), 'utf8'), 'not from the template\n');
  assert.equal(readProjectManifest(project).cliVersion, result.toVersion, 'the next upgrade starts from this version');
  assert.match(formatUpgradeSummary(result), /Con conflictos[^\n]*\(1\):\n {2}backend\/conflict\.js/);
});

test('dry run plans without writing and a second upgrade has nothing to do', (t) => {
  const { project, options } = setup(t);
  commitAll(project);
  const planned = upgradeProject({ ...options, dryRun: true });
  assert.ok(planned.plan.length > 0);
  assert.equal(readFileSync(join(project, 'backend', 'server.js'), 'utf8'), 'export const port = 8000;\n');
  assert.equal(git(project, 'status', '--porcelain'), '');

  upgradeProject(options);
  commitAll(project);
  const again = upgradeProject({ ...options, generateBase: options.generateCurrent });
  assert.deepEqual(again.plan.filter((entry) => entry.action !== 'skipped'), []);
  assert.match(formatUpgradeSummary(again), /ya está al día/);
});

test('upgrade refuses uncommitted changes, unknown base versions and missing manifests', (t) => {
  const { project, options } = setup(t);
  assert.throws(() => upgradeProject(options), /git repository/);
  commitAll(project);
  writeFileSync(join(project, 'backend', 'server.js'), 'dirty\n');
  assert.throws(() => upgradeProject(options), /Commit or stash/);
  // Projects generated before 1.6.0 (schema 2) do not record the CLI version.
  const { templates } = JSON.parse(readFileSync(join(project, '.create-my-saas.json'), 'utf8'));
  writeJson(join(project, '.create-my-saas.json'), { schemaVersion: 2, templates });
  assert.throws(() => upgradeProject({ ...options, fromVersion: undefined, allowDirty: true }), /--from <version>/);
  assert.ok(upgradeProject({ ...options, allowDirty: true, dryRun: true }).plan.length > 0, 'with --from it works');
  rmSync(join(project, '.create-my-saas.json'));
  assert.throws(() => upgradeProject({ ...options, allowDirty: true }), /No \.create-my-saas\.json/);
});

test('reads schema 2 and schema 3 manifests', (t) => {
  const workspace = mkdtempSync(join(tmpdir(), 'create-my-saas-manifest-'));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const templatesEntry = { backend: { id: 'backend:fastapi', version: '0.1.0', source: 'backend/fastapi-starter' }, frontend: { id: 'frontend:nextjs', version: '0.1.0', source: 'frontend/nextjs-starter' } };
  writeJson(join(workspace, '.create-my-saas.json'), { schemaVersion: 2, templates: templatesEntry, extensions: [{ id: 'pro:api-keys', version: '1.1.0', source: '', manifestSchemaVersion: 1 }] });
  assert.deepEqual(readProjectManifest(workspace), { schemaVersion: 2, cliVersion: undefined, backendId: 'fastapi', frontendId: 'nextjs', featureIds: ['pro:api-keys'], extensions: [{ id: 'pro:api-keys', version: '1.1.0' }], unmanaged: [] });
  writeJson(join(workspace, '.create-my-saas.json'), { schemaVersion: 3, cliVersion: '1.6.0', templates: templatesEntry, features: ['api-keys'], extensions: [], files: {}, unmanaged: ['deployment/nginx.conf'] });
  assert.deepEqual(readProjectManifest(workspace), { schemaVersion: 3, cliVersion: '1.6.0', backendId: 'fastapi', frontendId: 'nextjs', featureIds: ['api-keys'], extensions: [], unmanaged: ['deployment/nginx.conf'] });
  writeJson(join(workspace, '.create-my-saas.json'), { schemaVersion: 9, templates: templatesEntry });
  assert.throws(() => readProjectManifest(workspace), /schemaVersion must be 2, 3 or 4/);
});

test('parses upgrade options and routes the subcommand', () => {
  assert.deepEqual(parseUpgradeArguments(['./shop', '--from', 'v1.3.3', '--dry-run', '--extensions-dir=../pro', '--allow-dirty']), {
    projectDirectory: './shop', fromVersion: '1.3.3', extensionsDirectories: ['../pro'], baseExtensionsDirectories: [], featureIds: [], dryRun: true, allowDirty: true, help: false,
  });
  const modules = parseUpgradeArguments(['--feature', 'storage', '--feature=pro:other', '--base-extensions-dir', '../pro-1.1.0', '--base-extensions-dir=../shared', '--extensions-dir', '../pro-1.2.0']);
  assert.deepEqual([modules.featureIds, modules.baseExtensionsDirectories, modules.extensionsDirectories], [['storage', 'pro:other'], ['../pro-1.1.0', '../shared'], ['../pro-1.2.0']]);
  assert.throws(() => parseUpgradeArguments(['--base-extensions-dir']), /Missing value for --base-extensions-dir/);
  assert.equal(parseUpgradeArguments([]).projectDirectory, '.');
  assert.throws(() => parseUpgradeArguments(['--from']), /Missing value for --from/);
  const errors = [];
  assert.equal(run(['upgrade', '--nope'], { log: () => {}, error: (message) => errors.push(message) }), 1);
  assert.match(errors[0], /Unknown option: --nope/);
});

/** A Pro-style module for test-backend in its own directory, as customers receive it. */
function storageModule(root, version, storage) {
  const directory = join(root, `pro-storage-${version}`, 'storage');
  mkdirSync(join(directory, 'overlays', 'backend'), { recursive: true });
  writeJson(join(directory, 'extension.manifest.json'), {
    schemaVersion: 1, id: 'pro:storage', aliases: ['storage'], version, displayName: 'Storage', description: 'Test module.',
    provides: [], requires: { cli: '^1.0.0', capabilities: [], extensions: [] },
    supportedStacks: [{ backend: { id: 'backend:test-backend', version: '^1.0.0' } }],
    targets: [{ template: 'backend:test-backend', overlay: 'overlays/backend', replace: [], migrations: [], environment: [{ name: 'STORAGE_BUCKET', value: version, secret: false, description: 'Bucket.' }] }],
  });
  writeFileSync(join(directory, 'overlays', 'backend', 'storage.js'), storage, 'utf8');
  return join(root, `pro-storage-${version}`);
}

const storageSource = (driver, retries) => `export const driver = "${driver}";\nexport const timeout = 30;\nexport const region = "eu";\nexport const retries = ${retries};\n`;

function moduleSetup(t, { initial } = {}) {
  const workspace = mkdtempSync(join(tmpdir(), 'create-my-saas-upgrade-modules-'));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const source = templates(join(workspace, 'templates'), { 'server.js': 'export const port = 8000;\n' });
  const v110 = storageModule(workspace, '1.1.0', storageSource('local', 1));
  const v120 = storageModule(workspace, '1.2.0', storageSource('local', 3));
  const project = join(workspace, 'project');
  generateProject({ destination: project, backendId: 'test-backend', templatesDirectory: source, extensionsDirectories: [v110], featureIds: initial ? ['storage'] : [] });
  commitAll(project);
  // Same CLI version on both sides: the base comes from this CLI too, no generateBase needed.
  const options = { projectDirectory: project, generateCurrent: (selection) => generateProject({ ...selection, templatesDirectory: source }) };
  return { project, options, v110, v120 };
}

test('upgrade adds a module to an existing project', (t) => {
  const { project, options, v120 } = moduleSetup(t);
  const planned = upgradeProject({ ...options, featureIds: ['storage'], extensionsDirectories: [v120], dryRun: true });
  assert.equal(existsSync(join(project, 'backend', 'storage.js')), false, 'dry run writes nothing');
  assert.equal(git(project, 'status', '--porcelain'), '');

  const result = upgradeProject({ ...options, featureIds: ['storage'], extensionsDirectories: [v120] });
  assert.deepEqual(result.plan, planned.plan);
  const actions = Object.fromEntries(result.plan.map((entry) => [entry.path, entry.action]));
  assert.equal(actions['backend/storage.js'], 'added');
  assert.equal(actions['backend/.env.example'], 'updated');
  assert.match(readFileSync(join(project, 'backend', '.env.example'), 'utf8'), /STORAGE_BUCKET=1\.2\.0/);
  const manifest = JSON.parse(readFileSync(join(project, '.create-my-saas.json'), 'utf8'));
  assert.deepEqual([manifest.features, manifest.extensions.map(({ id, version }) => `${id}@${version}`)], [['storage'], ['pro:storage@1.2.0']]);
  assert.deepEqual(result.modules, [{ id: 'pro:storage', to: '1.2.0' }]);
  assert.match(formatUpgradeSummary(result), /^Módulos: \+ pro:storage@1\.2\.0$/m);

  commitAll(project);
  assert.throws(() => upgradeProject({ ...options, featureIds: ['pro:storage'], extensionsDirectories: [v120] }), /El proyecto ya usa pro:storage@1\.2\.0/);
  assert.throws(() => upgradeProject({ ...options, featureIds: ['nope'], extensionsDirectories: [v120] }), /Módulo desconocido "nope"/);
});

test('upgrade moves a module to a new version with --base-extensions-dir', (t) => {
  const { project, options, v110, v120 } = moduleSetup(t, { initial: true });
  writeFileSync(join(project, 'backend', 'storage.js'), storageSource('s3', 1));
  commitAll(project);

  const result = upgradeProject({ ...options, baseExtensionsDirectories: [v110], extensionsDirectories: [v120] });
  const actions = Object.fromEntries(result.plan.map((entry) => [entry.path, entry.action]));
  assert.equal(actions['backend/storage.js'], 'merged');
  assert.equal(actions['backend/.env.example'], 'updated');
  assert.equal(readFileSync(join(project, 'backend', 'storage.js'), 'utf8'), storageSource('s3', 3));
  assert.match(readFileSync(join(project, 'backend', '.env.example'), 'utf8'), /STORAGE_BUCKET=1\.2\.0/);
  assert.match(formatUpgradeSummary(result), /Módulos: pro:storage 1\.1\.0 → 1\.2\.0/);
  assert.equal(readProjectManifest(project).extensions[0].version, '1.2.0', 'the next upgrade starts from 1.2.0');
});

test('upgrade checks the module versions before generating anything', (t) => {
  const { options, v110, v120 } = moduleSetup(t, { initial: true });
  const refuse = (extra, pattern) => assert.throws(() => upgradeProject({ ...options, ...extra, generateCurrent: () => assert.fail('must not generate') }), pattern);
  refuse({ extensionsDirectories: [v120] }, /usa pro:storage@1\.1\.0 y --extensions-dir trae 1\.2\.0\. Para cambiar de versión pasa la carpeta de 1\.1\.0 con --base-extensions-dir/);
  refuse({}, /El proyecto usa pro:storage@1\.1\.0; pasa su carpeta con --extensions-dir\./);
  refuse({ baseExtensionsDirectories: [v120], extensionsDirectories: [v120] }, /El proyecto usa pro:storage@1\.1\.0 y --base-extensions-dir trae 1\.2\.0; pasa su carpeta con --base-extensions-dir\./);
  refuse({ baseExtensionsDirectories: [v110] }, /Falta pro:storage en --extensions-dir/);
  refuse({ featureIds: ['storage'], extensionsDirectories: [v110] }, /El proyecto ya usa pro:storage@1\.1\.0/);
  // Same versions on both sides is today's behaviour and has nothing to do.
  assert.deepEqual(upgradeProject({ ...options, extensionsDirectories: [v110], dryRun: true }).plan, []);
});
