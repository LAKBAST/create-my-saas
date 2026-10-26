import type postgres from 'postgres';

export type AdminUser = { id: string; name: string; email: string; emailVerified: boolean; isActive: boolean; createdAt: string };
export type AdminQuery = { page: number; pageSize: number; search?: string };
export interface AdminRepository {
  hasGrant(userId: string): Promise<boolean>;
  overview(days: number): Promise<{ totalUsers: number; enabledUsers: number; verifiedUsers: number; newUsers: number }>;
  users(query: AdminQuery): Promise<{ items: AdminUser[]; total: number }>;
}

export class PostgresAdminRepository implements AdminRepository {
  constructor(private readonly sql: postgres.Sql) {}
  async hasGrant(userId: string) {
    const rows = await this.sql`select user_id from platform_admins where user_id = ${userId}`;
    return rows.length > 0;
  }
  async overview(days: number) {
    const since = new Date(Date.now() - days * 86400000);
    const [row] = await this.sql`select count(*) as total, count(*) filter (where is_active) as enabled,
      count(*) filter (where email_verified) as verified, count(*) filter (where created_at >= ${since}) as recent from users`;
    return { totalUsers: Number(row.total), enabledUsers: Number(row.enabled), verifiedUsers: Number(row.verified), newUsers: Number(row.recent) };
  }
  async users(query: AdminQuery) {
    const pattern = `%${(query.search ?? '').trim().toLowerCase().replace(/[!%_]/g, '!$&')}%`;
    const where = this.sql`(lower(name) like ${pattern} escape '!' or lower(email) like ${pattern} escape '!')`;
    const [count] = await this.sql`select count(*) as total from users where ${where}`;
    const rows = await this.sql`select id, name, email, email_verified, is_active, created_at from users where ${where}
      order by created_at desc, id desc limit ${query.pageSize} offset ${(query.page - 1) * query.pageSize}`;
    return { items: rows.map((row) => ({ id: String(row.id), name: String(row.name), email: String(row.email),
      emailVerified: Boolean(row.email_verified), isActive: Boolean(row.is_active), createdAt: new Date(row.created_at as string).toISOString() })), total: Number(count.total) };
  }
}
