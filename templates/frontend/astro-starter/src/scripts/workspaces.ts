export type Organization = { id: string; name: string; slug: string };
export type WorkspaceContext = {
  model: 'individual' | 'teams' | 'mixed';
  personalWorkspace: Organization | null;
  teams: Organization[];
  billingSupported: boolean;
};

type WorkspaceRequest = (path: string, init: Omit<RequestInit, 'body'> & { body?: unknown; token?: string | null }) => Promise<unknown>;

export async function bootstrapWorkspace(request: WorkspaceRequest, token: string, legacyBilling = false): Promise<WorkspaceContext> {
  try {
    return await request('/workspaces/bootstrap', { method: 'POST', token, cache: 'no-store' }) as WorkspaceContext;
  } catch (error) {
    if (typeof error !== 'object' || error === null || !('status' in error) || error.status !== 404) throw error;
    // Preserve older generated backends which only understand organizations.
    return { model: 'teams', personalWorkspace: null, teams: legacyBilling ? await request('/organizations', { token, cache: 'no-store' }) as Organization[] : [], billingSupported: legacyBilling };
  }
}
