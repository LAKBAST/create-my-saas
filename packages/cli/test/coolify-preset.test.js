import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { defaultTemplatesDirectory } from '../src/catalog.js';
import { generateProject } from '../src/generator.js';

function generated(t, options) {
  const temporary = mkdtempSync(join(tmpdir(), 'cms-coolify-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const destination = join(temporary, 'project');
  generateProject({ destination, templatesDirectory: defaultTemplatesDirectory, ...options });
  const read = (file) => readFileSync(join(destination, 'deployment', file), 'utf8');
  return { read, destination };
}

test('Coolify full stack keeps API private and routes Astro through an HTTP gateway', (t) => {
  const { read, destination } = generated(t, { backendId: 'fastapi', frontendId: 'astro' });
  const compose = read('compose.coolify.yaml');
  assert.match(compose, /DATABASE_URL: "\$\{DATABASE_URL:\?Set DATABASE_URL in Coolify\}"/);
  assert.match(compose, /TRUSTED_PROXY_IPS: "\$\{GATEWAY_IP:\?Set GATEWAY_IP in Coolify\}"/);
  assert.match(compose, /PUBLIC_SITE_URL: \$\{FRONTEND_URL:\?Set FRONTEND_URL in Coolify\}/);
  assert.match(compose, /condition: service_healthy/);
  assert.doesNotMatch(compose, /env_file:|ports:|certs\/|postgres:\n|redis:\n/);
  assert.match(read('nginx.coolify.conf'), /listen 80;/);
  assert.match(read('nginx.coolify.conf'), /location ~ \^\/\(auth\|/);
  assert.doesNotMatch(read('nginx.coolify.conf'), /listen 443|ssl_certificate/);
  const manifest = JSON.parse(readFileSync(join(destination, '.create-my-saas.json'), 'utf8'));
  for (const path of ['deployment/compose.coolify.yaml', 'deployment/COOLIFY.md', 'deployment/gateway.coolify.Dockerfile', 'deployment/nginx.coolify.conf']) {
    assert.ok(manifest.files[path], `${path} must be tracked for upgrade`);
  }
  assert.equal(manifest.files['deployment/.env'], undefined);
});

test('Coolify API-only preset has a migration job and no public host port', (t) => {
  const { read } = generated(t, { backendId: 'nestjs' });
  const compose = read('compose.coolify.yaml');
  assert.match(compose, /  migrate:/);
  assert.match(compose, /profiles: \["migrate"\]/);
  assert.match(compose, /TRUST_PROXY_HEADERS: "false"/);
  assert.doesNotMatch(compose, /TRUSTED_PROXY_IPS: "\$\{GATEWAY_IP/);
  assert.doesNotMatch(compose, /  gateway:|  frontend:|ports:/);
});

test('Coolify Next.js retains its build-time API proxy', (t) => {
  const compose = generated(t, { backendId: 'nestjs', frontendId: 'nextjs' }).read('compose.coolify.yaml');
  assert.match(compose, /API_PROXY_TARGET: http:\/\/api:8000/);
});

test('Coolify React Router retains its runtime API proxy', (t) => {
  const compose = generated(t, { backendId: 'fastapi', frontendId: 'react-router' }).read('compose.coolify.yaml');
  assert.match(compose, /API_PROXY_TARGET: http:\/\/api:8000/);
});

test('Coolify static Astro preset has no API secrets or migration job', (t) => {
  const { read } = generated(t, { frontendId: 'astro' });
  const compose = read('compose.coolify.yaml');
  assert.match(compose, /PUBLIC_SITE_URL: \$\{FRONTEND_URL:\?Set FRONTEND_URL in Coolify\}/);
  assert.doesNotMatch(compose, /  api:|  migrate:|DATABASE_URL|SECRET_KEY/);
  assert.match(read('nginx.coolify.conf'), /proxy_pass http:\/\/frontend:3000/);
  assert.doesNotMatch(read('nginx.coolify.conf'), /proxy_pass http:\/\/api:8000/);
});
