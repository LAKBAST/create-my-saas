import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../auth/service.js';

export function registerWorkspaceRoutes(app: FastifyInstance, auth: AuthService): void {
  app.post('/workspaces/bootstrap', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    await auth.currentUser(request.headers.authorization);
    return { model: 'individual', personalWorkspace: null, teams: [], billingSupported: false };
  });
}
