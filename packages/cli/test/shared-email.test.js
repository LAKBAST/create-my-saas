import assert from 'node:assert/strict';
import test from 'node:test';
import { sharedEmailDrift } from '../../../scripts/sync-shared-email.mjs';

test('every branded-email backend ships the current templates/shared/email files', () => {
  assert.deepEqual(sharedEmailDrift(), [], 'Run node scripts/sync-shared-email.mjs after editing templates/shared/email.');
});
