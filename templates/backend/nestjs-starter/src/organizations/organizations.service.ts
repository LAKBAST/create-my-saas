import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { isEmail } from 'class-validator';
import { AppError } from '../common/errors/app.error';
import { User } from '../users/user.entity';
import { Invitation } from './invitation.entity';
import { Membership, OrganizationRole } from './membership.entity';
import { Organization } from './organization.entity';
import { SecureEmailService } from '../auth/secure-email.service';
import { AuditLogService } from '../audit/audit-log.service';

@Injectable()
export class OrganizationsService {
 constructor(
  @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
  @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
  @InjectRepository(Invitation) private readonly invitations: Repository<Invitation>,
  private readonly dataSource: DataSource,
  private readonly secureEmail: SecureEmailService,
  private readonly audit: AuditLogService,
 ) {}
 async create(user: User, name: string, slug?: string): Promise<Organization> {
  const derived = (slug ?? name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!derived) throw new AppError('INVALID_ORGANIZATION_SLUG', 'Organization slug must contain letters or numbers.', 400);
  try {
   return await this.dataSource.transaction(async (manager) => {
    const organizations = manager.getRepository(Organization);
    const memberships = manager.getRepository(Membership);
    const organization = await organizations.save(organizations.create({ name, slug: derived }));
    await memberships.save(memberships.create({ organizationId: organization.id, userId: user.id, role: 'owner' }));
    return organization;
   });
  } catch (error) {
   if (this.isUniqueViolation(error)) throw new AppError('SLUG_ALREADY_EXISTS', 'Organization slug is already in use.', 409);
   throw error;
  }
 }
 async list(userId: string): Promise<Organization[]> {
  return this.organizations.createQueryBuilder('organization').innerJoin(Membership, 'membership', 'membership.organization_id = organization.id').where('membership.user_id = :userId', { userId }).orderBy('organization.created_at', 'ASC').getMany();
 }
 async members(organizationId: string) {
  return this.memberships.createQueryBuilder('membership')
   .innerJoin(User, 'user', 'user.id = membership.user_id')
   .select('membership.id', 'id').addSelect('membership.user_id', 'user_id')
   .addSelect('user.email', 'email').addSelect('user.name', 'name').addSelect('membership.role', 'role')
   .where('membership.organization_id = :organizationId', { organizationId }).getRawMany();
 }
 async invite(organizationId: string, actorUserId: string, email: string, role: 'admin' | 'member'): Promise<{ id: string; accepted: false }> {
  const normalizedEmail = this.normalizeEmail(email);
  const raw = randomBytes(48).toString('base64url');
  let deliver = true;
  let created: Invitation;
  try {
   created = await this.dataSource.transaction(async (manager) => {
    const invitations = manager.getRepository(Invitation);
    const query = invitations.createQueryBuilder('invitation')
     .where('invitation.organization_id = :organizationId AND invitation.email = :email AND invitation.accepted_at IS NULL', { organizationId, email: normalizedEmail });
    if (this.dataSource.options.type !== 'sqljs') query.setLock('pessimistic_write');
    const existing = await query.getOne();
    if (existing && existing.expiresAt > new Date() && existing.deliveredAt) { deliver = false; return existing; }
    if (existing && !existing.deliveredAt) {
     existing.role = role;
     existing.tokenHash = this.hash(raw);
     existing.expiresAt = new Date(Date.now() + 7 * 86_400_000);
     return invitations.save(existing);
    }
    if (existing) await invitations.remove(existing);
    const invitation = await invitations.save(invitations.create({ organizationId, email: normalizedEmail, role, tokenHash: this.hash(raw), acceptedAt: null, deliveredAt: null, expiresAt: new Date(Date.now() + 7 * 86_400_000) }));
    await this.audit.record({
     organizationId, actorUserId, action: 'organization.invitation.created', targetType: 'invitation', targetId: invitation.id,
     metadata: { email: normalizedEmail, role },
    }, manager);
    return invitation;
   });
  } catch (error) {
   if (!this.isUniqueViolation(error)) throw error;
   created = await this.dataSource.transaction(async (manager) => {
    const invitations = manager.getRepository(Invitation);
    const query = invitations.createQueryBuilder('invitation')
     .where('invitation.organization_id = :organizationId AND invitation.email = :email AND invitation.accepted_at IS NULL', { organizationId, email: normalizedEmail });
    if (this.dataSource.options.type !== 'sqljs') query.setLock('pessimistic_write');
    const existing = await query.getOne();
    if (!existing || existing.expiresAt <= new Date()) throw error;
    if (existing.deliveredAt) { deliver = false; return existing; }
    existing.role = role;
    existing.tokenHash = this.hash(raw);
    existing.expiresAt = new Date(Date.now() + 7 * 86_400_000);
    return invitations.save(existing);
   });
  }
  if (deliver) {
   await this.secureEmail.send(normalizedEmail, 'Organization invitation', `Use this one-time invitation token: ${raw}`);
   await this.invitations.update({ id: created.id, tokenHash: this.hash(raw) }, { deliveredAt: new Date() });
  }
  return { id: created.id, accepted: false };
 }
 async acceptInvitation(user: User, token: string): Promise<Membership> {
  const email = this.normalizeEmail(user.email);
  return this.dataSource.transaction(async (manager) => {
   const invitations = manager.getRepository(Invitation);
   const memberships = manager.getRepository(Membership);
   const query = invitations.createQueryBuilder('invitation').where('invitation.token_hash = :tokenHash', { tokenHash: this.hash(token) });
   if (this.dataSource.options.type !== 'sqljs') query.setLock('pessimistic_write');
   const invitation = await query.getOne();
   if (!invitation || invitation.email !== email || invitation.expiresAt <= new Date()) throw new AppError('INVALID_INVITATION', 'The invitation is invalid or expired.', 400);

   const existingMembership = await memberships.findOneBy({ organizationId: invitation.organizationId, userId: user.id });
   if (invitation.acceptedAt) {
    if (existingMembership) return existingMembership;
    throw new AppError('INVALID_INVITATION', 'The invitation is invalid or expired.', 400);
   }

   const membership = existingMembership ?? await memberships.save(memberships.create({ organizationId: invitation.organizationId, userId: user.id, role: invitation.role }));
   const accepted = await invitations.update({ id: invitation.id, acceptedAt: IsNull() }, { acceptedAt: new Date() });
   if (!accepted.affected) {
    const persistedMembership = await memberships.findOneBy({ organizationId: invitation.organizationId, userId: user.id });
    if (persistedMembership) return persistedMembership;
    throw new AppError('INVALID_INVITATION', 'The invitation is invalid or expired.', 400);
   }
   await this.audit.record({
    organizationId: invitation.organizationId, actorUserId: user.id, action: 'organization.invitation.accepted',
    targetType: 'invitation', targetId: invitation.id, metadata: { role: invitation.role },
   }, manager);
   return membership;
  });
 }
 async changeRole(organizationId: string, actorUserId: string, memberId: string, role: OrganizationRole): Promise<void> {
  await this.dataSource.transaction(async (manager) => {
   await this.lockOrganization(manager.getRepository(Organization), organizationId);
   const memberships = manager.getRepository(Membership);
   const query = memberships.createQueryBuilder('membership')
    .where('membership.organization_id = :organizationId AND (membership.user_id = :actorUserId OR membership.id = :memberId OR membership.user_id = :memberId)', { organizationId, actorUserId, memberId })
    .orderBy('membership.user_id', 'ASC');
   if (this.dataSource.options.type !== 'sqljs') query.setLock('pessimistic_write');
   const lockedMemberships = await query.getMany();
   const actor = lockedMemberships.find((membership) => membership.userId === actorUserId);
   const target = lockedMemberships.find((membership) => membership.id === memberId) ?? lockedMemberships.find((membership) => membership.userId === memberId);
   if (!actor) throw new AppError('MEMBERSHIP_REQUIRED', 'Organization membership is required.', 403);
   if (!['owner', 'admin'].includes(actor.role)) throw new AppError('INSUFFICIENT_ROLE', 'This organization role cannot perform that action.', 403);
   if (!target) throw new AppError('MEMBERSHIP_NOT_FOUND', 'Membership was not found.', 404);
   if (target.role === 'owner' || role === 'owner') throw new AppError('OWNER_ROLE_PROTECTED', 'Owner role cannot be transferred through this endpoint.', 400);
   if (target.role !== role) {
    const previousRole = target.role;
    await memberships.update(target.id, { role });
    await this.audit.record({
     organizationId, actorUserId, action: 'organization.member.role_changed', targetType: 'user', targetId: target.userId,
     metadata: { previousRole, newRole: role },
    }, manager);
   }
  });
 }
 async removeMember(organizationId: string, actorUserId: string, memberId: string): Promise<void> {
  await this.dataSource.transaction(async (manager) => {
   await this.lockOrganization(manager.getRepository(Organization), organizationId);
   const memberships = manager.getRepository(Membership);
   const query = memberships.createQueryBuilder('membership')
    .where('membership.organization_id = :organizationId AND (membership.user_id = :actorUserId OR membership.id = :memberId OR membership.user_id = :memberId)', { organizationId, actorUserId, memberId })
    .orderBy('membership.user_id', 'ASC');
   if (this.dataSource.options.type !== 'sqljs') query.setLock('pessimistic_write');
   const lockedMemberships = await query.getMany();
   const actor = lockedMemberships.find((membership) => membership.userId === actorUserId);
   const target = lockedMemberships.find((membership) => membership.id === memberId) ?? lockedMemberships.find((membership) => membership.userId === memberId);
   if (!actor) throw new AppError('MEMBERSHIP_REQUIRED', 'Organization membership is required.', 403);
   if (!['owner', 'admin'].includes(actor.role)) throw new AppError('INSUFFICIENT_ROLE', 'This organization role cannot perform that action.', 403);
   if (!target) throw new AppError('MEMBERSHIP_NOT_FOUND', 'Membership was not found.', 404);
   if (target.role === 'owner') throw new AppError('OWNER_REQUIRED', 'Transfer ownership before removing the owner.', 409);
   await this.audit.record({
    organizationId, actorUserId, action: 'organization.member.removed', targetType: 'user', targetId: target.userId,
    metadata: { role: target.role },
   }, manager);
   await memberships.remove(target);
  });
 }
 async transferOwnership(organizationId: string, actorUserId: string, targetUserId: string): Promise<void> {
  if (actorUserId === targetUserId) {
   throw new AppError('OWNERSHIP_TARGET_NOT_ELIGIBLE', 'Ownership must be transferred to another active organization member.', 409);
  }
  await this.dataSource.transaction(async (manager) => {
   const userIds = [...new Set([actorUserId, targetUserId])].sort();
   const usersQuery = manager.getRepository(User).createQueryBuilder('user')
    .where('user.id IN (:...userIds)', { userIds })
    .orderBy('user.id', 'ASC');
   if (this.dataSource.options.type !== 'sqljs') usersQuery.setLock('pessimistic_write');
   const users = await usersQuery.getMany();
   const actorUser = users.find((user) => user.id === actorUserId);
   const targetUser = users.find((user) => user.id === targetUserId);

   await this.lockOrganization(manager.getRepository(Organization), organizationId);
   const memberships = manager.getRepository(Membership);
   const membershipsQuery = memberships.createQueryBuilder('membership')
    .where('membership.organization_id = :organizationId AND membership.user_id IN (:...userIds)', { organizationId, userIds })
    .orderBy('membership.user_id', 'ASC');
   if (this.dataSource.options.type !== 'sqljs') membershipsQuery.setLock('pessimistic_write');
   const lockedMemberships = await membershipsQuery.getMany();
   const currentOwner = lockedMemberships.find((membership) => membership.userId === actorUserId);
   const target = lockedMemberships.find((membership) => membership.userId === targetUserId);

   if (!actorUser?.isActive || !currentOwner || currentOwner.role !== 'owner') {
    throw new AppError('INSUFFICIENT_ROLE', 'Only the current organization owner can transfer ownership.', 403);
   }
   if (!targetUser?.isActive || !target) {
    throw new AppError('OWNERSHIP_TARGET_NOT_ELIGIBLE', 'Ownership can only be transferred to an active organization member.', 409);
   }

   const targetPreviousRole = target.role;
   await memberships.update(target.id, { role: 'owner' });
   const demoted = await memberships.update({ id: currentOwner.id, role: 'owner' }, { role: 'admin' });
   if (demoted.affected === 0) {
    throw new AppError('INSUFFICIENT_ROLE', 'Only the current organization owner can transfer ownership.', 403);
   }
   await this.audit.record({
    organizationId, actorUserId, action: 'organization.ownership.transferred', targetType: 'user', targetId: targetUserId,
    metadata: { previousOwnerNewRole: 'admin', newOwnerPreviousRole: targetPreviousRole },
   }, manager);
  });
 }
 private async lockOrganization(organizations: Repository<Organization>, organizationId: string): Promise<void> {
  const query = organizations.createQueryBuilder('organization').where('organization.id = :organizationId', { organizationId });
  if (this.dataSource.options.type !== 'sqljs') query.setLock('pessimistic_write');
  if (!await query.getOne()) throw new AppError('MEMBERSHIP_REQUIRED', 'Organization membership is required.', 403);
 }
 private hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
 private normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!isEmail(normalized) || normalized.length > 320) throw new AppError('INVALID_INVITATION_EMAIL', 'A valid invitation email is required.', 400);
  return normalized;
 }
 private isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (
   ('code' in error && error.code === '23505') ||
   ('message' in error && typeof error.message === 'string' && error.message.includes('UNIQUE constraint failed'))
  );
 }
}
