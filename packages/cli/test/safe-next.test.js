import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

for (const path of [
  'templates/frontend/nextjs-starter/app/lib/safe-next.ts',
  'templates/frontend/react-router-starter/app/lib/safe-next.ts',
  'templates/frontend/astro-starter/src/scripts/safe-next.ts',
]) {
  test(`${path} accepts only same-origin paths`, async () => {
    const source = stripTypeScriptTypes(readFileSync(resolve(import.meta.dirname, '../../..', path), 'utf8'));
    const { safeNext } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    for (const valid of ['/app', '/billing?priceId=price_pro', '/a#section']) assert.equal(safeNext(valid), valid);
    for (const invalid of [null, '', 'https://evil.example', '//evil.example', '/\\evil.example', '/\n/evil.example', 'javascript:alert(1)']) assert.equal(safeNext(invalid), null);
  });
}
