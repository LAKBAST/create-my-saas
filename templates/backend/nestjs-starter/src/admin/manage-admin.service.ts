import { DataSource } from 'typeorm';
import { PlatformAdmin } from './platform-admin.entity';
import { User } from '../users/user.entity';

export function validateAdminCommand(operation: string, userId: string, extra: string[] = []): void {
  if (!['grant', 'revoke'].includes(operation) || !userId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(userId) || extra.length) {
    throw new Error('Usage: node dist/admin/manage-admin.js <grant|revoke> <user-uuid>');
  }
}

export async function setPlatformAdmin(dataSource: DataSource, operation: string, userId: string): Promise<void> {
  validateAdminCommand(operation, userId);
  await dataSource.transaction(async (manager) => {
    const user = await manager.getRepository(User).findOne({ where: { id: userId }, ...(dataSource.options.type === 'postgres' ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
    if (!user) throw new Error('User not found.');
    if (operation === 'grant') {
      if (!user.isActive || !user.emailVerified) throw new Error('Only active users with verified email can receive platform access.');
      await manager.getRepository(PlatformAdmin).upsert({ userId }, ['userId']);
    } else {
      await manager.getRepository(PlatformAdmin).delete({ userId });
    }
  });
}
