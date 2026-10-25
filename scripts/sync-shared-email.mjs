#!/usr/bin/env node
// Copies templates/shared/email into every backend that sends branded emails.
// `--check` only reports drift (CI and the CLI tests use it).
import { copyFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'templates/shared/email');
// NestJS and Fastify join once their renderers read these files.
export const emailBackends = ['fastapi-starter'];

export function sharedEmailDrift() {
  const drift = [];
  for (const backend of emailBackends) {
    for (const file of readdirSync(source)) {
      const target = join(root, 'templates/backend', backend, 'email', file);
      let current;
      try { current = readFileSync(target, 'utf8'); } catch { current = undefined; }
      if (current?.replace(/\r\n/g, '\n') !== readFileSync(join(source, file), 'utf8').replace(/\r\n/g, '\n')) drift.push(target);
    }
  }
  return drift;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const drift = sharedEmailDrift();
    if (drift.length) {
      console.error(`Out of date with templates/shared/email (run node scripts/sync-shared-email.mjs):\n${drift.join('\n')}`);
      process.exit(1);
    }
  } else {
    for (const backend of emailBackends) {
      const target = join(root, 'templates/backend', backend, 'email');
      mkdirSync(target, { recursive: true });
      for (const file of readdirSync(source)) copyFileSync(join(source, file), join(target, file));
    }
  }
}
