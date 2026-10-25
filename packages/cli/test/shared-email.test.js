import assert from 'node:assert/strict';
import test from 'node:test';
import { sharedEmailDrift } from '../../../scripts/sync-shared-email.mjs';

test('every branded-email backend ships the current templates/shared/email files', () => {
  assert.deepEqual(sharedEmailDrift(), [], 'Run node scripts/sync-shared-email.mjs after editing templates/shared/email.');
});

test('NestJS and Fastify share the same email renderer', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (backend) => readFileSync(new URL(`../../../templates/backend/${backend}/src/email/email-templates.ts`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(read('fastify-starter'), read('nestjs-starter'), 'Keep src/email/email-templates.ts identical in both templates.');
});
