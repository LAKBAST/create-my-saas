import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Organization } from './organization.entity';
import { AppError } from '../common/errors/app.error';
import { User } from '../users/user.entity';
import { Membership, OrganizationRole } from './membership.entity';
import { ORGANIZATION_ROLES } from './roles.decorator';
@Injectable()
export class OrganizationRoleGuard implements CanActivate {
 constructor(private readonly reflector: Reflector, @InjectRepository(Membership) private readonly memberships: Repository<Membership>, @InjectRepository(Organization) private readonly organizations: Repository<Organization>, private readonly config: ConfigService) {}
 async canActivate(context: ExecutionContext): Promise<boolean> {
  const roles = this.reflector.getAllAndOverride<OrganizationRole[]>(ORGANIZATION_ROLES, [context.getHandler(), context.getClass()]) ?? ['member', 'admin', 'owner'];
  const req = context.switchToHttp().getRequest<Request & { user: User }>();
  const value = req.params.organizationId ?? req.params.id;
  const organizationId = Array.isArray(value) ? value[0] : value;
  if (!organizationId || !req.user) throw new AppError('ORGANIZATION_ACCESS_DENIED', 'Organization access is required.', 403);
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(organizationId)) throw new AppError('HTTP_422', 'The request payload is invalid.', 422);
  const organization = await this.organizations.findOneBy({ id: organizationId });
  if (!organization || (organization.personalOwnerUserId && organization.personalOwnerUserId !== req.user.id) || (!organization.personalOwnerUserId && this.config.get('PRODUCT_MODEL', 'teams') === 'individual') || (organization.personalOwnerUserId && this.config.get('PRODUCT_MODEL', 'teams') === 'teams')) throw new AppError('ORGANIZATION_ACCESS_DENIED', 'Organization access is required.', 403);
  const membership = await this.memberships.findOneBy({ organizationId, userId: req.user.id });
  if (!membership) throw new AppError('MEMBERSHIP_REQUIRED', 'Organization membership is required.', 403);
  if (!roles.includes(membership.role)) throw new AppError('INSUFFICIENT_ROLE', 'This organization role cannot perform that action.', 403);
  return true;
 }
}
