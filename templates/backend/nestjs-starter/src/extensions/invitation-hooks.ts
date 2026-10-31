import type { EntityManager } from 'typeorm';

export type InvitationHook = (action: 'create' | 'accept', manager: EntityManager, organizationId: string, email: string, userId: string) => Promise<void>;
