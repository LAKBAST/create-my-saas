import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../../..');
const source = readFileSync(resolve(root, 'templates/shared/api-contract.ts'));

test('every frontend ships the same public API contract', () => {
  for (const path of [
    'templates/frontend/nextjs-starter/app/lib/api-contract.ts',
    'templates/frontend/react-router-starter/app/lib/api-contract.ts',
    'templates/frontend/astro-starter/src/scripts/api-contract.ts',
  ]) {
    assert.deepEqual(readFileSync(resolve(root, path)), source, `${path} differs from the shared contract`);
  }
});
