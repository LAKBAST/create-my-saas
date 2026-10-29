import { randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { CreateUsers1773139200000 } from './migrations/1773139200000-create-users';
import { AddSaasCore1773139300000 } from './migrations/1773139300000-add-saas-core';
import { HardenOrganizationInvitations1773139400000 } from './migrations/1773139400000-harden-organization-invitations';
import { AddStripeBilling1773139500000 } from './migrations/1773139500000-add-stripe-billing';
import { AddAuditLogs1773139600000 } from './migrations/1773139600000-add-audit-logs';
import { AddOAuthAccounts1773139700000 } from './migrations/1773139700000-add-oauth-accounts';
import { AddReferentialIntegrity1773139800000 } from './migrations/1773139800000-add-referential-integrity';
import { AddInvitationDelivery1773139900000 } from './migrations/1773139900000-add-invitation-delivery';
import { TrackPreviousSubscriptions1773140000000 } from './migrations/1773140000000-track-previous-subscriptions';
import { AddSubscriptionSeats1773140100000 } from './migrations/1773140100000-add-subscription-seats';
import { AddPlatformAdmins1773140200000 } from './migrations/1773140200000-add-platform-admins';
import { AddPersonalWorkspaces1773140300000 } from './migrations/1773140300000-add-personal-workspaces';
import { AddOrganizationCreator1773140400000 } from './migrations/1773140400000-add-organization-creator';

const integration = process.env.POSTGRES_INTEGRATION_TESTS === '1' ? describe : describe.skip;
const baseline = [CreateUsers1773139200000, AddSaasCore1773139300000, HardenOrganizationInvitations1773139400000,
  AddStripeBilling1773139500000, AddAuditLogs1773139600000, AddOAuthAccounts1773139700000,
  AddReferentialIntegrity1773139800000, AddInvitationDelivery1773139900000, TrackPreviousSubscriptions1773140000000,
  AddSubscriptionSeats1773140100000, AddPlatformAdmins1773140200000, AddPersonalWorkspaces1773140300000];

integration('organization creator migration on PostgreSQL', () => {
  let database: DataSource;
  let runner: QueryRunner;
  let schema: string;
  beforeEach(async () => {
    schema = 'creator_' + randomUUID().replaceAll('-', '');
    database = await new DataSource({ type: 'postgres', url: process.env.DATABASE_URL, schema }).initialize();
    runner = database.createQueryRunner();
    await runner.connect();
    await runner.query('CREATE SCHEMA "' + schema + '"');
    await runner.query('SET search_path TO "' + schema + '"');
    for (const Migration of baseline) await new Migration().up(runner);
  });
  afterEach(async () => {
    if (runner) { await runner.query('DROP SCHEMA "' + schema + '" CASCADE'); await runner.release(); }
    await database?.destroy();
  });
  async function user() {
    const id = randomUUID();
    await runner.query('INSERT INTO users (id, email, name) VALUES ($1, $2, $3)', [id, id + '@example.test', 'Person']);
    return id;
  }
  async function organization() {
    const id = randomUUID();
    await runner.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [id, 'Team', id]);
    return id;
  }
  async function columnNullable() {
    const [column] = await runner.query('SELECT is_nullable FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3', [schema, 'organizations', 'created_by_id']) as Array<{ is_nullable: string }>;
    return column.is_nullable;
  }
  it('migrates an empty 1.11 schema and enforces the user foreign key', async () => {
    const migration = new AddOrganizationCreator1773140400000();
    await migration.up(runner);
    expect(await columnNullable()).toBe('NO');
    await expect(runner.query('INSERT INTO organizations (id,name,slug,created_by_id) VALUES ($1,$2,$3,$4)', [randomUUID(), 'Invalid', 'invalid-team', randomUUID()])).rejects.toMatchObject({ code: '23503' });
    await migration.down(runner);
    await migration.up(runner);
  });
  it('backfills the oldest owner, ignores earlier non-owners and preserves provenance after transfer', async () => {
    const first = await user(), later = await user(), member = await user(), id = await organization();
    for (const [who, role, created] of [[member, 'member', '2020-01-01'], [later, 'owner', '2022-01-01'], [first, 'owner', '2021-01-01']]) {
      await runner.query('INSERT INTO memberships (id, organization_id, user_id, role, created_at) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), id, who, role, created]);
    }
    await new AddOrganizationCreator1773140400000().up(runner);
    expect(await columnNullable()).toBe('NO');
    await runner.query("UPDATE memberships SET role='member' WHERE user_id=$1", [first]);
    const [row] = await runner.query('SELECT created_by_id FROM organizations WHERE id=$1', [id]) as Array<{ created_by_id: string }>;
    expect(row.created_by_id).toBe(first);
  });
  it('reports one orphan and leaves its creator unknown and the column nullable', async () => {
    const id = await organization();
    const warning = jest.spyOn(database.logger, 'log');
    await new AddOrganizationCreator1773140400000().up(runner);
    expect(await columnNullable()).toBe('YES');
    const [row] = await runner.query('SELECT created_by_id FROM organizations WHERE id=$1', [id]) as Array<{ created_by_id: string | null }>;
    expect(row.created_by_id).toBeNull();
    expect(warning).toHaveBeenCalledWith('warn', expect.stringContaining('1 organizations have no owner'));
  });
});
