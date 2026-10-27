import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readManifest } from './manifest.js';

const ports = { 'backend:fastapi': 8000, 'backend:nestjs': 3001, 'backend:fastify': 3002 };
const credentialsFile = '.env.demo';

function entries(path) {
  return new Map([...readFileSync(path, 'utf8').matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)]
    .map(([, name, value]) => [name, value.trim()]));
}

function regularFile(path) {
  try { if (!lstatSync(path).isFile()) throw new Error(`Expected a regular file: ${path}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function localDatabase(raw) {
  try {
    const url = new URL(raw.replace(/^postgresql\+asyncpg:/, 'postgresql:'));
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}

function credentials(root) {
  const path = join(root, credentialsFile);
  regularFile(path);
  if (!existsSync(path)) {
    const password = `${randomBytes(24).toString('base64url')}A1!`;
    const contents = `# Local demo accounts. Never deploy or commit this file.\nDEMO_OWNER_EMAIL=demo-owner@example.test\nDEMO_MEMBER_EMAIL=demo-member@example.test\nDEMO_PASSWORD=${password}\n`;
    const descriptor = openSync(path, 'wx', 0o600);
    try { writeFileSync(descriptor, contents, 'utf8'); }
    finally { closeSync(descriptor); }
  }
  const stored = entries(path);
  const owner = stored.get('DEMO_OWNER_EMAIL');
  const member = stored.get('DEMO_MEMBER_EMAIL');
  const password = stored.get('DEMO_PASSWORD');
  if (!owner || !member || owner === member || !password || password.length < 8) {
    throw new Error(`${credentialsFile} must contain two distinct demo emails and DEMO_PASSWORD.`);
  }
  return { path, owner, member, password };
}

function sessionCookies(response, csrfName) {
  const values = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie')].filter(Boolean);
  // Older Node 20 versions may combine Set-Cookie headers. An Expires date also
  // contains a comma, so split only before the next cookie name.
  const cookies = new Map(values.flatMap((value) => value.split(/,(?=\s*[^;,=]+=)/))
    .map((value) => value.trim().split(';', 1)[0].split(/=(.*)/s).slice(0, 2)));
  return {
    cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
    csrf: cookies.get(csrfName) ?? '',
  };
}

async function responseJson(response, action) {
  if (!response.ok) throw new Error(`${action} failed (HTTP ${response.status}). Check the local API and its logs.`);
  return response.json();
}

export async function seedDemo(projectDirectory = '.', { request = fetch } = {}) {
  const root = resolve(projectDirectory);
  const manifest = readManifest(root);
  if (!manifest) throw new Error(`No generated project found at ${root}.`);
  const backendId = manifest.templates.backend?.id;
  const port = ports[backendId];
  if (!port) throw new Error('Demo seed requires a FastAPI, NestJS or Fastify backend.');
  const envPath = join(root, 'backend', '.env');
  regularFile(envPath);
  if (!existsSync(envPath)) throw new Error('Missing backend/.env. Run create-my-saas setup first.');
  const env = entries(envPath);
  if (env.get('APP_ENV') !== 'development') throw new Error('Demo seed requires APP_ENV=development.');
  if (manifest.productModel && env.get('PRODUCT_MODEL') !== manifest.productModel) throw new Error('PRODUCT_MODEL does not match the generated project.');
  if (!localDatabase(env.get('DATABASE_URL') ?? '')) throw new Error('Demo seed requires a local PostgreSQL URL in backend/.env.');
  if (env.get('EMAIL_DELIVERY_URL')) throw new Error('Disable EMAIL_DELIVERY_URL before creating demo accounts.');
  const origin = `http://127.0.0.1:${port}`;
  let ready;
  try { ready = await request(`${origin}/ready`, { signal: AbortSignal.timeout(3000) }); }
  catch { throw new Error(`Local API is unavailable at ${origin}. Start it and run the seed again.`); }
  if (!ready.ok) throw new Error(`Local API is not ready at ${origin} (HTTP ${ready.status}).`);
  const saved = credentials(root);
  const csrfName = env.get('CSRF_COOKIE_NAME') || 'csrf_token';

  async function post(path, body, headers = {}) {
    return request(`${origin}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
  }
  async function account(email, name) {
    const register = await post('/auth/register', { email, name, password: saved.password });
    if (register.status !== 201 && register.status !== 409) await responseJson(register, `Register ${email}`);
    const login = await post('/auth/login', { email, password: saved.password });
    if (!login.ok) throw new Error(`Could not log in as ${email} (HTTP ${login.status}). The account may already exist with another password.`);
    const session = await login.json();
    const token = session.accessToken ?? session.access_token;
    if (!token) throw new Error(`Login for ${email} returned no access token.`);
    return { token, ...sessionCookies(login, csrfName) };
  }

  const owner = await account(saved.owner, 'Demo Owner');
  await account(saved.member, 'Demo Member');
  const headers = { Authorization: `Bearer ${owner.token}`, Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf };
  const bootstrap = await post('/workspaces/bootstrap', {}, headers);
  const workspace = await responseJson(bootstrap, 'Workspace bootstrap');
  const model = manifest.productModel ?? (backendId === 'backend:fastify' ? 'individual' : 'teams');
  if (workspace.model !== model) throw new Error(`The API product model (${workspace.model}) differs from the generated project (${model}).`);
  let team = null;
  if (model !== 'individual') {
    const organizations = await request(`${origin}/organizations`, { headers: { Authorization: `Bearer ${owner.token}` }, signal: AbortSignal.timeout(10000) });
    const existing = await responseJson(organizations, 'List organizations');
    team = existing.find((organization) => organization.slug === 'demo-workspace') ?? null;
    if (!team) {
      const created = await post('/organizations', { name: 'Demo Workspace', slug: 'demo-workspace' }, headers);
      team = await responseJson(created, 'Create demo workspace');
    }
  }
  return { ownerEmail: saved.owner, memberEmail: saved.member, credentialsPath: saved.path, model, team, personalWorkspace: workspace.personalWorkspace ?? null };
}
