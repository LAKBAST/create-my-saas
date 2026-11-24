import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import postgres from 'postgres';
import { PostgresSessionRepository } from '../src/db/postgres-repository.js';

// Opt-in contract: uses an isolated schema in the supplied test database.
test('OAuth revokes a refresh replacement inserted before invalidation but committed later', {
  skip: process.env.POSTGRES_INTEGRATION_TESTS !== '1',
  timeout: 15_000,
}, async () => {
  assert.ok(process.env.DATABASE_URL, 'A test DATABASE_URL is required');
  const schema = `oauth_race_${randomUUID().replaceAll('-', '')}`;
  const admin = postgres(process.env.DATABASE_URL, { max: 1 });
  const sql = postgres(process.env.DATABASE_URL, { max: 4, connection: { search_path: schema } });
  let release!: () => void;
  const resume = new Promise<void>((resolve) => { release = resolve; });
  let ready!: () => void;
  const paused = new Promise<void>((resolve) => { ready = resolve; });
  let rotation: ReturnType<PostgresSessionRepository['rotateSession']> | undefined;
  let invalidation: Promise<void> | undefined;
  try {
    await admin`create schema ${admin(schema)}`;
    await sql`create table users (
      id uuid primary key, email text, name text, password_hash text,
      email_verified boolean not null, is_active boolean not null default true,
      created_at timestamptz not null default now()
    )`;
    await sql`create table browser_sessions (
      id uuid primary key, user_id uuid not null references users(id),
      access_token_hash text, refresh_token_hash text,
      access_expires_at timestamptz, refresh_expires_at timestamptz, revoked_at timestamptz
    )`;
    const repository = new PostgresSessionRepository(sql);
    const user = await repository.createUser({ email: 'race@example.com', name: 'Race', passwordHash: 'untrusted' });
    const original = {
      id: randomUUID(), userId: user.id, accessTokenHash: 'old-access', refreshTokenHash: 'old-refresh',
      accessExpiresAt: new Date(Date.now() + 60_000), refreshExpiresAt: new Date(Date.now() + 60_000), revokedAt: null,
    };
    await repository.createSession(original);
    const rotatingRepository = new PostgresSessionRepository({
      begin: (work: (transaction: postgres.TransactionSql) => Promise<unknown>) => sql.begin(async (transaction) => {
        const result = await work(transaction);
        ready();
        await resume;
        return result;
      }),
    } as unknown as postgres.Sql);
    rotation = rotatingRepository.rotateSession({
      previousSessionId: original.id, accessTokenHash: 'replacement-access', refreshTokenHash: 'replacement-refresh',
      accessExpiresAt: original.accessExpiresAt, refreshExpiresAt: original.refreshExpiresAt,
    });
    await Promise.race([paused, rotation.then(() => { throw new Error('Rotation did not pause before commit.'); })]);
    invalidation = repository.secureUnverifiedOAuthUser(user.id);
    const deadline = Date.now() + 5000;
    for (;;) {
      const waiting = await sql`select 1 from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'
        and (query like '%update users set password_hash%' or query like '%update browser_sessions set revoked_at%')`;
      if (waiting.length) break;
      if (Date.now() > deadline) throw new Error('OAuth did not wait for the pending rotation.');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    release();
    const [replacement] = await Promise.all([rotation, invalidation]);
    assert.ok(replacement);
    // Read before any reuse handling, which could otherwise hide a missed revocation.
    assert.ok((await repository.findSessionByRefreshHash('replacement-refresh'))?.revokedAt);
    assert.ok((await repository.findSessionByRefreshHash('old-refresh'))?.revokedAt);
    assert.equal(await repository.findActiveSessionByRefreshHash('replacement-refresh'), undefined);
    const current = await repository.findUserById(user.id);
    assert.equal(current?.passwordHash, null);
    assert.equal(current?.emailVerified, true);
    assert.equal(await repository.rotateSession({
      previousSessionId: replacement.id, accessTokenHash: 'forbidden-access', refreshTokenHash: 'forbidden-refresh',
      accessExpiresAt: original.accessExpiresAt, refreshExpiresAt: original.refreshExpiresAt,
    }), undefined);
  } finally {
    release();
    await Promise.allSettled([rotation, invalidation]);
    await sql.end();
    await admin`drop schema if exists ${admin(schema)} cascade`;
    await admin.end();
  }
});
