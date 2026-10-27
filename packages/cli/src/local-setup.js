import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { connect } from 'node:net';
import { readManifest } from './manifest.js';

function project(projectDirectory) {
  const root = resolve(projectDirectory);
  const manifest = readManifest(root);
  if (!manifest) throw new Error(`No generated project found at ${root}. Run this command inside a create-my-saas project.`);
  return { root, manifest };
}

function values(contents) {
  return new Map([...contents.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map(([, name, value]) => [name, value.trim()]));
}

function replace(contents, entries) {
  return contents.split(/\r?\n/).map((line) => {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    return match && entries.has(match[1]) ? `${match[1]}=${entries.get(match[1])}` : line;
  }).join('\n');
}

function ensureRegular(path) {
  try { if (!lstatSync(path).isFile()) throw new Error(`Expected a regular file: ${path}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function writeNew(path, contents) {
  const descriptor = openSync(path, 'wx', 0o600);
  try { writeFileSync(descriptor, contents, 'utf8'); }
  finally { closeSync(descriptor); }
}

function backendPort(id) {
  return { 'backend:fastapi': 8000, 'backend:nestjs': 3001, 'backend:fastify': 3002 }[id];
}

export function setupLocal(projectDirectory = '.') {
  const { root, manifest } = project(projectDirectory);
  const selected = manifest.templates;
  const files = [];
  let backendContents;
  const secret = randomBytes(48).toString('base64url');
  if (selected.backend) {
    const example = join(root, 'backend', '.env.example');
    const target = join(root, 'backend', '.env');
    ensureRegular(example); ensureRegular(target);
    if (!existsSync(example)) throw new Error(`Missing backend configuration example: ${example}`);
    const contents = readFileSync(example, 'utf8');
    const database = selected.backend.id === 'backend:fastapi'
      ? 'postgresql+asyncpg://postgres:postgres@localhost:5432/app'
      : 'postgresql://postgres:postgres@localhost:5432/app';
    const replacements = new Map([['SECRET_KEY', secret], ['APP_ENV', 'development'], ['DATABASE_URL', database], ['REDIS_URL', 'redis://localhost:6379']]);
    if (manifest.productModel) replacements.set('PRODUCT_MODEL', manifest.productModel);
    backendContents = existsSync(target) ? readFileSync(target, 'utf8') : replace(contents, replacements);
    if (values(backendContents).get('APP_ENV') !== 'development') throw new Error('backend/.env is not a development configuration. Refusing to copy it to local Compose.');
    files.push({ path: target, contents: backendContents });
  }
  if (selected.frontend) {
    const example = join(root, 'frontend', '.env.example');
    const target = join(root, 'frontend', '.env');
    ensureRegular(example); ensureRegular(target);
    if (!existsSync(example)) throw new Error(`Missing frontend configuration example: ${example}`);
    const port = backendPort(selected.backend?.id);
    const replacements = new Map([
      ['API_PROXY_TARGET', port ? `http://localhost:${port}` : ''],
      ['NEXT_PUBLIC_SITE_URL', 'http://localhost:3000'],
      ['VITE_PUBLIC_SITE_URL', 'http://localhost:3000'],
      ['PUBLIC_SITE_URL', 'http://localhost:3000'],
    ]);
    files.push({ path: target, contents: replace(readFileSync(example, 'utf8'), replacements) });
  }
  const deployment = join(root, 'deployment', '.env');
  ensureRegular(deployment);
  if (selected.backend) {
    // Compose's local override replaces the host database/Redis URLs with the
    // service names. This file is explicitly development-only.
    files.push({ path: deployment, contents: `# Local development only. Use .env.production.example for production.\n${backendContents}` });
  } else {
    files.push({ path: deployment, contents: '# Local development only. Use .env.production.example for production.\nFRONTEND_URL=http://localhost:3000\n' });
  }
  const created = [];
  const preserved = [];
  for (const file of files) {
    if (existsSync(file.path)) { preserved.push(file.path); continue; }
    writeNew(file.path, file.contents);
    created.push(file.path);
  }
  return { root, created, preserved, hasBackend: Boolean(selected.backend), hasFrontend: Boolean(selected.frontend) };
}

function socketOpen(host, port) {
  return new Promise((resolveSocket) => {
    const socket = connect({ host, port });
    const finish = (open) => { socket.destroy(); resolveSocket(open); };
    socket.setTimeout(1500, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

export async function doctorProject(projectDirectory = '.', { services = true, probe = socketOpen } = {}) {
  const { root, manifest } = project(projectDirectory);
  const checks = [];
  const check = (ok, message, action) => checks.push({ ok, message, action });
  const backendId = manifest.templates.backend?.id;
  const frontendId = manifest.templates.frontend?.id;
  let backend = new Map();
  if (backendId) {
    const path = join(root, 'backend', '.env');
    ensureRegular(path);
    const present = existsSync(path);
    check(present, 'Backend .env', 'Run create-my-saas setup to create it.');
    if (present) {
      backend = values(readFileSync(path, 'utf8'));
      const secret = backend.get('SECRET_KEY') ?? '';
      check(secret.length >= 32 && !/replace|change-me|example/i.test(secret), 'Local SECRET_KEY is configured', 'Run setup for a new project or set a strong SECRET_KEY in backend/.env.');
      check(backend.get('APP_ENV') === 'development', 'Backend uses development mode', 'Set APP_ENV=development in backend/.env.');
      if (manifest.productModel) check(backend.get('PRODUCT_MODEL') === manifest.productModel, `Product model matches ${manifest.productModel}`, `Set PRODUCT_MODEL=${manifest.productModel} in backend/.env.`);
      for (const [name, defaultPort] of [['DATABASE_URL', 5432], ['REDIS_URL', 6379]]) {
        const raw = backend.get(name);
        if (!raw) { check(false, `${name} is configured`, `Set ${name} in backend/.env.`); continue; }
        let url;
        try { url = new URL(raw.replace(/^postgresql\+asyncpg:/, 'postgresql:')); }
        catch { check(false, `${name} has a valid URL`, `Fix ${name} in backend/.env.`); continue; }
        if (!services) { check(true, `${name} has a valid URL`); continue; }
        const open = await probe(url.hostname, Number(url.port || defaultPort));
        check(open, `${name} host responds on TCP`, `Start local services with docker compose -f compose.yaml -f compose.dev.yaml --env-file .env up -d postgres redis from deployment/. TCP does not verify credentials.`);
      }
    }
  }
  if (frontendId) {
    const path = join(root, 'frontend', '.env');
    ensureRegular(path);
    const present = existsSync(path);
    check(present, 'Frontend .env', 'Run create-my-saas setup to create it.');
    if (present) {
      const frontend = values(readFileSync(path, 'utf8'));
      const publicUrl = ['NEXT_PUBLIC_SITE_URL', 'VITE_PUBLIC_SITE_URL', 'PUBLIC_SITE_URL'].map((name) => frontend.get(name)).find(Boolean);
      check(Boolean(publicUrl && !publicUrl.includes('example.com')), 'Frontend public URL is configured', 'Set the public URL in frontend/.env.');
      if (backendId) check(frontend.get('API_PROXY_TARGET') === `http://localhost:${backendPort(backendId)}`, 'Frontend API proxy matches the selected backend', `Set API_PROXY_TARGET=http://localhost:${backendPort(backendId)} in frontend/.env.`);
    }
  }
  const deployment = join(root, 'deployment', '.env');
  ensureRegular(deployment);
  check(existsSync(deployment), 'Local Compose .env', 'Run create-my-saas setup to create it.');
  return { root, checks, ok: checks.every((item) => item.ok) };
}
