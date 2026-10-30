import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseProArguments, runProCommand } from '../src/pro.js';
import { run } from '../src/cli.js';
import { generateProject } from '../src/generator.js';

const token = 'customer-test-token';
const selectedVersion = {
  version: '2.2.0',
  requires: { cli: '^1.0.0' },
  supportedStacks: [{ feature: 'admin-dashboard-nestjs', backend: { id: 'backend:nestjs' }, frontend: { id: 'frontend:nextjs' } }],
  compatible: true,
};

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function fakeStore(t, { archive, fail, versionInfo } = {}) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ url: request.url, token: request.headers['x-customer-token'] });
    const failure = fail?.(request.url);
    if (failure) {
      response.writeHead(failure.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ code: failure.code }));
    } else if (request.url === '/store-api/licences') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ licences: [{ id: 'licence-1', product: 'pro:admin-dashboard', status: 'active' }] }));
    } else if (request.url === '/store-api/licences/licence-1/versions?community=1.13.0') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(typeof versionInfo === 'function' ? versionInfo() : versionInfo ?? { product: 'pro:admin-dashboard', latest: '2.2.0', recommended: '2.2.0', versions: [selectedVersion] }));
    } else if (request.url === '/store-api/licences/licence-1/download?version=2.2.0') {
      response.writeHead(200, { 'content-type': 'application/gzip' });
      response.end(archive);
    } else {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ code: 'not_found' }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const previousUrl = process.env.CREATE_MY_SAAS_STORE_URL;
  process.env.CREATE_MY_SAAS_STORE_URL = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    if (previousUrl === undefined) delete process.env.CREATE_MY_SAAS_STORE_URL;
    else process.env.CREATE_MY_SAAS_STORE_URL = previousUrl;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  return requests;
}

function projectWithExtensionArchive(t) {
  const workspace = mkdtempSync(join(tmpdir(), 'create-my-saas-module-test-'));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const project = join(workspace, 'project');
  generateProject({ destination: project, backendId: 'nestjs', frontendId: 'nextjs', extensionsDirectories: [], featureIds: [] });
  execFileSync('git', ['init', '-q'], { cwd: project });
  execFileSync('git', ['-c', 'core.autocrlf=false', 'add', '-A'], { cwd: project });
  execFileSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-qm', 'generated'], { cwd: project });

  const moduleRoot = join(workspace, 'archive-content', 'pro-admin-dashboard-2.2.0');
  const overlay = join(moduleRoot, 'overlays', 'backend');
  mkdirSync(overlay, { recursive: true });
  writeJson(join(moduleRoot, 'delivery.manifest.json'), { schemaVersion: 1, product: 'pro:admin-dashboard', version: '2.2.0' });
  writeJson(join(moduleRoot, 'extension.manifest.json'), {
    schemaVersion: 1,
    id: 'pro:admin-dashboard',
    aliases: ['admin-dashboard-nestjs'],
    version: '2.2.0',
    displayName: 'Admin dashboard',
    description: 'Test Pro module.',
    provides: [],
    requires: { cli: '^1.0.0', capabilities: [], extensions: [] },
    supportedStacks: [{ backend: { id: 'backend:nestjs', version: '^0.2.0' }, frontend: { id: 'frontend:nextjs', version: '^0.2.0' } }],
    targets: [{ template: 'backend:nestjs', overlay: 'overlays/backend', replace: [], migrations: [], environment: [] }],
  });
  writeFileSync(join(overlay, 'admin-dashboard-probe.ts'), 'export const installedByProCli = true;\n', 'utf8');
  const archivePath = join(workspace, 'module.tar.gz');
  // Relative paths, so GNU tar (Git Bash on Windows) does not read C: as a host.
  const tar = spawnSync('tar', ['-czf', 'module.tar.gz', '-C', 'archive-content', 'pro-admin-dashboard-2.2.0'], { cwd: workspace, encoding: 'utf8' });
  assert.equal(tar.status, 0, `tar fixture creation failed: ${tar.stderr}`);
  return { project, archive: readFileSync(archivePath) };
}

test('pro add uses the licensed compatible module, dry-run skips download, and install delegates to upgrade', async (t) => {
  const { project, archive } = projectWithExtensionArchive(t);
  const requests = await fakeStore(t, { archive });
  const output = [];
  const errors = [];
  const dryRunStatus = await runProCommand(['add', 'pro:admin-dashboard', project, '--version', '2.2.0', '--dry-run', '--token', token], {
    log: (message) => output.push(message), error: (message) => errors.push(message),
  });

  assert.equal(dryRunStatus, 0, errors.join('\n'));
  assert.deepEqual(errors, []);
  assert.match(output.join('\n'), /Licencia: licence-1 \(pro:admin-dashboard, active\)/);
  assert.match(output.join('\n'), /Versión: 2\.2\.0/);
  assert.match(output.join('\n'), /Feature: admin-dashboard-nestjs/);
  assert.ok(output.includes(`Comando: create-my-saas upgrade ${JSON.stringify(project)} --feature admin-dashboard-nestjs --extensions-dir "<carpeta temporal>"`));
  assert.equal(requests.some(({ url }) => url.includes('/download?')), false, 'dry-run does not request the archive');

  const previousDirectory = process.cwd();
  process.chdir(project);
  try {
    const listStatus = await runProCommand(['list', '--token', token], { log: (message) => output.push(message), error: (message) => errors.push(message) });
    assert.equal(listStatus, 0);
    assert.match(output.at(-1), /recomendada para Community 1\.13\.0: 2\.2\.0/);
  } finally {
    process.chdir(previousDirectory);
  }

  const installStatus = await runProCommand(['add', 'admin-dashboard', project, '--token', token], {
    log: (message) => output.push(message), error: (message) => errors.push(message),
  });
  assert.equal(installStatus, 0, errors.join('\n'));
  assert.equal(readFileSync(join(project, 'backend', 'admin-dashboard-probe.ts'), 'utf8'), 'export const installedByProCli = true;\n');
  assert.ok(requests.some(({ url }) => url === '/store-api/licences/licence-1/download?version=2.2.0'));
  assert.ok(requests.every(({ token: receivedToken }) => receivedToken === token), 'every API call sends the customer token header');
  assert.doesNotMatch(output.join('\n'), new RegExp(token));
  assert.equal(errors.length, 0);
});

test('pro commands translate the Store suspended-licence response into Spanish', async (t) => {
  const requests = await fakeStore(t, { fail: (url) => url === '/store-api/licences' ? { status: 403, code: 'licence_suspended' } : undefined });
  const errors = [];
  const status = await runProCommand(['list', '--token', token], { log: () => {}, error: (message) => errors.push(message) });
  assert.equal(status, 1);
  assert.match(errors.join('\n'), /licencia está suspendida/i);
  assert.ok(requests.every(({ token: receivedToken }) => receivedToken === token));
});

test('pro commands translate revoked, missing-version, and integrity errors', async (t) => {
  const { project, archive } = projectWithExtensionArchive(t);
  let failureMode = 'revoked';
  const requests = await fakeStore(t, { archive, fail: (url) => {
    if (failureMode === 'revoked' && url === '/store-api/licences') return { status: 403, code: 'licence_revoked' };
    if (failureMode === 'version' && url.includes('/versions?')) return { status: 404, code: 'version_not_found' };
    if (failureMode === 'integrity' && url.includes('/download?')) return { status: 409, code: 'delivery_integrity_failed' };
    return undefined;
  } });
  const errors = [];
  const invoke = () => runProCommand(['add', 'admin-dashboard', project, '--token', token], { log: () => {}, error: (message) => errors.push(message) });

  assert.equal(await invoke(), 1);
  assert.match(errors.join('\n'), /licencia ha sido revocada/i);
  errors.length = 0;
  failureMode = 'version';
  assert.equal(await invoke(), 1);
  assert.match(errors.join('\n'), /versión solicitada no existe/i);
  errors.length = 0;
  failureMode = 'integrity';
  assert.equal(await invoke(), 1);
  assert.match(errors.join('\n'), /no superó la comprobación de integridad/i);
  assert.ok(requests.every(({ token: receivedToken }) => receivedToken === token));
});

test('pro help is routed by the public CLI and list rejects add-only options', async () => {
  const output = [];
  assert.equal(await run(['pro', '--help'], { log: (message) => output.push(message), error: () => assert.fail('help should not fail') }), 0);
  assert.match(output.join('\n'), /create-my-saas pro list/);
  assert.throws(() => parseProArguments(['list', '--version', '2.2.0']), /Opción desconocida/);
});

test('pro add explains missing Community compatibility and unsupported stacks', async (t) => {
  const { project, archive } = projectWithExtensionArchive(t);
  const errors = [];
  let versionInfo = {
    recommended: '2.2.0',
    versions: [{ ...selectedVersion, compatible: false, requires: { cli: '^2.0.0' } }],
  };
  await fakeStore(t, { archive, versionInfo: () => versionInfo });
  const invoke = () => runProCommand(['add', 'admin-dashboard', project, '--dry-run', '--token', token], { log: () => {}, error: (message) => errors.push(message) });

  assert.equal(await invoke(), 1);
  assert.match(errors.join('\n'), /No hay una versión Pro compatible con Community 1\.13\.0\. Requiere Community \^2\.0\.0/);
  errors.length = 0;
  versionInfo = {
    recommended: '2.2.0',
    versions: [{ ...selectedVersion, supportedStacks: [{ feature: 'admin-dashboard-react-router', backend: { id: 'backend:nestjs' }, frontend: { id: 'frontend:react-router' } }] }],
  };
  assert.equal(await invoke(), 1);
  assert.match(errors.join('\n'), /no soporta el stack nestjs \+ nextjs\. Stacks compatibles: admin-dashboard-react-router \(nestjs \+ react-router\)/);
});

test('pro add refuses uncommitted changes before downloading unless --allow-dirty', async (t) => {
  const { project, archive } = projectWithExtensionArchive(t);
  const requests = await fakeStore(t, { archive });
  writeFileSync(join(project, 'README.md'), 'local edit\n', 'utf8');
  const errors = [];
  const output = [];
  const invoke = (...extra) => runProCommand(['add', 'admin-dashboard', project, '--token', token, ...extra], { log: (message) => output.push(message), error: (message) => errors.push(message) });

  assert.equal(await invoke(), 1);
  assert.match(errors.join('\n'), /Haz commit o stash de tus cambios/);
  assert.equal(requests.some(({ url }) => url.includes('/download?')), false, 'nothing is downloaded for a dirty project');
  errors.length = 0;
  assert.equal(await invoke('--allow-dirty'), 0, errors.join('\n'));
  assert.equal(readFileSync(join(project, 'backend', 'admin-dashboard-probe.ts'), 'utf8'), 'export const installedByProCli = true;\n');
});

test('pro commands report an unknown customer token instead of a missing licence', async (t) => {
  await fakeStore(t, { fail: (url) => url === '/store-api/licences' ? { status: 404, code: 'not_found' } : undefined });
  const errors = [];
  assert.equal(await runProCommand(['list', '--token', 'wrong-token'], { log: () => {}, error: (message) => errors.push(message) }), 1);
  assert.match(errors.join('\n'), /token de cliente no es válido/);
  assert.match(errors.join('\n'), /Ejecuta create-my-saas pro --help/);
});
