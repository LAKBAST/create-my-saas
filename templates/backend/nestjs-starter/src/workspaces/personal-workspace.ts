import { EntityManager, IsNull } from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import { Membership } from '../organizations/membership.entity';
import { User } from '../users/user.entity';
import { randomUUID } from 'node:crypto';

export type ProductModel = 'individual' | 'teams' | 'mixed';
export const workspaceDto = ({ id, name, slug }: Organization) => ({ id, name, slug });

/** Caller owns the transaction. PG locks the user, serializing personal creation. */
export async function ensurePersonalWorkspace(manager: EntityManager, user: User, model: ProductModel, postgres: boolean): Promise<Organization | null> {
  if (model === 'teams') return null;
  if (postgres) await manager.getRepository(User).findOneOrFail({ where: { id: user.id }, lock: { mode: 'pessimistic_write' } });
  const organizations = manager.getRepository(Organization);
  const existing = await organizations.findOneBy({ personalOwnerUserId: user.id });
  if (existing) return existing;
  const preferredSlug = `personal-${user.id}`;
  // Older projects could already contain this formerly-unreserved team slug.
  const slug = await organizations.existsBy({ slug: preferredSlug }) ? `personal-${randomUUID()}` : preferredSlug;
  const workspace = await organizations.save(organizations.create({ name: 'Espacio personal', slug, personalOwnerUserId: user.id }));
  const memberships = manager.getRepository(Membership);
  await memberships.save(memberships.create({ organizationId: workspace.id, userId: user.id, role: 'owner' }));
  return workspace;
}

export async function workspaceContext(manager: EntityManager, user: User, model: ProductModel, postgres: boolean) {
  const personal = await ensurePersonalWorkspace(manager, user, model, postgres);
  const teams = model === 'individual' ? [] : await manager.getRepository(Organization).createQueryBuilder('organization')
    .innerJoin(Membership, 'membership', 'membership.organization_id = organization.id')
    .where('membership.user_id = :userId', { userId: user.id }).andWhere({ personalOwnerUserId: IsNull() })
    .orderBy('organization.created_at', 'ASC').addOrderBy('organization.id', 'ASC').getMany();
  return { model, personalWorkspace: personal ? workspaceDto(personal) : null, teams: teams.map(workspaceDto), billingSupported: true };
}
