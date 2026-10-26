import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthService } from '../auth/service.js';
import type { AdminRepository } from '../admin/repository.js';
import { AppError } from '../http/errors.js';

const lists = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25), search: z.string().max(120).optional() }).strict();
const period = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).strict();

export function registerAdminRoutes(app: FastifyInstance, auth: AuthService, repository?: AdminRepository) {
  app.register(async (admin) => {
    admin.addHook('onRequest', async (_request, reply) => { reply.header('Cache-Control', 'private, no-store'); });
    admin.get('/access', async (request) => {
      const user = await auth.currentUser(request.headers.authorization);
      const allowed = Boolean(user.isActive && user.emailVerified && repository && await repository.hasGrant(user.id));
      return { allowed, resources: ['users'] };
    });
    admin.addHook('preHandler', async (request) => {
      if (request.routeOptions.url === '/admin/access') return;
      const user = await auth.currentUser(request.headers.authorization);
      if (!user.emailVerified || !repository || !await repository.hasGrant(user.id)) {
        throw new AppError(403, 'PLATFORM_ADMIN_REQUIRED', 'Platform administrator access is required.');
      }
    });
    admin.get('/overview', async (request) => {
      const { days } = period.parse(request.query);
      return { ...await repository!.overview(days), periodDays: days, totalOrganizations: null, newOrganizations: null,
        totalSubscriptions: null, subscriptionsByStatus: [], subscriptionsByPlan: [] };
    });
    admin.get('/users', async (request) => {
      const query = lists.parse(request.query);
      const result = await repository!.users(query);
      return { items: result.items.map(({ id, name, email, emailVerified, isActive, createdAt }) =>
        ({ id, name, email, emailVerified, isActive, createdAt })), total: result.total, page: query.page, pageSize: query.pageSize };
    });
    for (const resource of ['organizations', 'subscriptions']) admin.get(`/${resource}`, async () => {
      throw new AppError(404, 'ADMIN_RESOURCE_UNAVAILABLE', 'This backend does not provide this resource.');
    });
  }, { prefix: '/admin' });
}
