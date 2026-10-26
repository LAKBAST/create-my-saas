import postgres from 'postgres';

async function main() {
  const [operation, userId, ...extra] = process.argv.slice(2);
  if (!['grant', 'revoke'].includes(operation) || !userId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(userId) || extra.length) {
    throw new Error('Usage: node dist/admin/manage-admin.js <grant|revoke> <user-uuid>');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.');
  const sql = postgres(process.env.DATABASE_URL, { ssl: ['true', '1', 'yes', 'on'].includes(process.env.DATABASE_SSL?.toLowerCase() ?? '') ? 'verify-full' : false });
  try {
    await sql.begin(async (transaction) => {
      const [user] = await transaction`select id, is_active, email_verified from users where id = ${userId} for update`;
      if (!user) throw new Error('User not found.');
      if (operation === 'grant') {
        if (!user.is_active || !user.email_verified) throw new Error('Only active verified accounts can receive access.');
        await transaction`insert into platform_admins (user_id) values (${userId}) on conflict do nothing`;
      } else await transaction`delete from platform_admins where user_id = ${userId}`;
    });
    console.log(JSON.stringify({ event: `platform_admin.${operation}`, userId, at: new Date().toISOString() }));
  } finally { await sql.end(); }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error && /^(Usage:|DATABASE_URL must|User not found|Only active)/.test(error.message) ? error.message : 'Administrator command failed; check database configuration and migrations.');
  process.exitCode = 1;
});
