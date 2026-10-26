import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';
import { Membership } from '../organizations/membership.entity';
import { Subscription } from '../billing/subscription.entity';
import { PlatformAdmin } from './platform-admin.entity';
import { AdminListQuery } from './admin-query.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(PlatformAdmin) private readonly admins: Repository<PlatformAdmin>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
    @InjectRepository(Subscription) private readonly subscriptions: Repository<Subscription>,
  ) {}

  async hasAccess(user?: User): Promise<boolean> {
    return Boolean(user?.isActive && user.emailVerified && await this.admins.existsBy({ userId: user.id }));
  }

  async overview(days: number) {
    const since = new Date(Date.now() - days * 86400000);
    const [totalUsers, enabledUsers, verifiedUsers, newUsers, totalOrganizations, newOrganizations, totalSubscriptions, statuses, plans] = await Promise.all([
      this.users.count(), this.users.countBy({ isActive: true }), this.users.countBy({ emailVerified: true }),
      this.users.createQueryBuilder('u').where('u.createdAt >= :since', { since }).getCount(),
      this.organizations.count(), this.organizations.createQueryBuilder('o').where('o.createdAt >= :since', { since }).getCount(),
      this.subscriptions.count(),
      this.subscriptions.createQueryBuilder('s').select('s.status', 'status').addSelect('COUNT(*)', 'count').groupBy('s.status').orderBy('s.status', 'ASC').getRawMany<{ status: string; count: string }>(),
      this.subscriptions.createQueryBuilder('s').select('s.plan', 'plan').addSelect('COUNT(*)', 'count').groupBy('s.plan').orderBy('s.plan', 'ASC').getRawMany<{ plan: string; count: string }>(),
    ]);
    return { periodDays: days, totalUsers, enabledUsers, verifiedUsers, newUsers, totalOrganizations, newOrganizations, totalSubscriptions,
      subscriptionsByStatus: statuses.map((row) => ({ status: row.status, count: Number(row.count) })),
      subscriptionsByPlan: plans.map((row) => ({ plan: row.plan, count: Number(row.count) })),
    };
  }

  private filter<T extends ObjectLiteral>(query: SelectQueryBuilder<T>, fields: string[], search?: string) {
    if (search?.trim()) {
      // Escape LIKE metacharacters: a search for '_' or '%' is literal.
      const pattern = `%${search.trim().toLowerCase().replace(/[!%_]/g, '!$&')}%`;
      query.andWhere(new Brackets((where) => fields.forEach((field, index) => {
        const condition = `LOWER(${field}) LIKE :pattern ESCAPE '!'`;
        if (index === 0) where.where(condition, { pattern }); else where.orWhere(condition, { pattern });
      })));
    }
    return query;
  }

  async listUsers(input: AdminListQuery) {
    const query = this.filter(this.users.createQueryBuilder('u'), ['u.email', 'u.name'], input.search);
    const [users, total] = await query.select(['u.id', 'u.email', 'u.name', 'u.emailVerified', 'u.isActive', 'u.createdAt'])
      .orderBy('u.createdAt', 'DESC').addOrderBy('u.id', 'DESC').skip((input.page - 1) * input.pageSize).take(input.pageSize).getManyAndCount();
    return { items: users.map((u) => ({ id: u.id, email: u.email, name: u.name, emailVerified: u.emailVerified, isActive: u.isActive, createdAt: u.createdAt })), total, page: input.page, pageSize: input.pageSize };
  }

  async listOrganizations(input: AdminListQuery) {
    const query = this.filter(this.organizations.createQueryBuilder('o'), ['o.name', 'o.slug'], input.search);
    const total = await query.getCount();
    const rows = await query.select('o.id', 'id').addSelect('o.name', 'name').addSelect('o.slug', 'slug').addSelect('o.createdAt', 'createdAt')
      .addSelect((subquery) => subquery.select('COUNT(*)').from(Membership, 'm').where('m.organizationId = o.id'), 'memberCount')
      .orderBy('o.createdAt', 'DESC').addOrderBy('o.id', 'DESC').offset((input.page - 1) * input.pageSize).limit(input.pageSize)
      .getRawMany<{ id: string; name: string; slug: string; createdAt: Date | string; memberCount: string }>();
    return { items: rows.map((o) => ({ ...o, memberCount: Number(o.memberCount) })), total, page: input.page, pageSize: input.pageSize };
  }

  async listSubscriptions(input: AdminListQuery) {
    const query = this.filter(this.subscriptions.createQueryBuilder('s').innerJoin(Organization, 'o', 'o.id = s.organizationId'), ['o.name', 'o.slug', 's.plan', 's.status'], input.search);
    const total = await query.getCount();
    const rows = await query.select(['s.id', 's.organizationId', 's.plan', 's.status', 's.seats', 's.provider', 's.cancelAtPeriodEnd', 's.currentPeriodStart', 's.currentPeriodEnd'])
      .addSelect('o.name', 'organizationName').orderBy('s.createdAt', 'DESC').addOrderBy('s.id', 'DESC')
      .offset((input.page - 1) * input.pageSize).limit(input.pageSize).getRawAndEntities();
    const raw = rows.raw as Array<{ organizationName: string }>;
    return { items: rows.entities.map((s, index) => ({ id: s.id, organizationId: s.organizationId, organizationName: raw[index].organizationName, plan: s.plan, status: s.status, seats: s.seats, provider: s.provider, cancelAtPeriodEnd: s.cancelAtPeriodEnd, currentPeriodStart: s.currentPeriodStart, currentPeriodEnd: s.currentPeriodEnd })), total, page: input.page, pageSize: input.pageSize };
  }
}
