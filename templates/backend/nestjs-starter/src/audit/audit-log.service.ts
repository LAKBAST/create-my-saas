import { extensionAuditActions } from '../extensions/audit.generated';
import { composeAuditActions, validateAuditMetadata, type AuditValue, type AuditActionDefinition } from '../extensions/audit-registry';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AppError } from '../common/errors/app.error';
import { AuditLog } from './audit-log.entity';

export type AuditAction = string;

type AuditInput = {
  organizationId: string;
  actorUserId: string | null;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, AuditValue>;
};

const coreActions: Record<string, AuditActionDefinition> = {
  'organization.invitation.created': { metadata: ['email', 'role'] },
  'organization.invitation.accepted': { metadata: ['role'] },
  'organization.member.role_changed': { metadata: ['previousRole', 'newRole'] },
  'organization.member.removed': { metadata: ['role'] },
  'organization.ownership.transferred': { metadata: ['previousOwnerNewRole', 'newOwnerPreviousRole'] },
  'billing.checkout.created': { metadata: ['provider', 'plan', 'quantity'] },
  'billing.portal.created': { metadata: ['provider'] },
};

const allowedActions = composeAuditActions(coreActions, extensionAuditActions);

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
    private readonly config: ConfigService,
  ) {}

  /** Persist only allowlisted metadata; never pass request/provider payloads here. */
  async record(input: AuditInput, manager?: EntityManager): Promise<AuditLog | null> {
    const metadata = input.metadata ?? {};
    validateAuditMetadata(allowedActions, input.action, metadata);
    if (!this.config.get<boolean>('AUDIT_LOG_ENABLED', true)) return null;
    const repository = manager?.getRepository(AuditLog) ?? this.logs;
    return repository.save(repository.create({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata,
      createdAt: new Date(),
    }));
  }

  async list(organizationId: string, limit = 50, cursor?: string): Promise<{ items: AuditLog[]; nextCursor: string | null }> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new AppError('INVALID_AUDIT_LIMIT', 'Audit log limit must be between 1 and 100.', 400);
    if (cursor && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(cursor)) throw new AppError('INVALID_AUDIT_CURSOR', 'Audit log cursor is invalid.', 400);
    const pageSize = limit;
    const query = this.logs.createQueryBuilder('audit')
      .where('audit.organizationId = :organizationId', { organizationId })
      .orderBy('audit.createdAt', 'DESC')
      .addOrderBy('audit.id', 'DESC')
      .take(pageSize + 1);
    if (cursor) {
      const cursorRow = await this.logs.findOneBy({ id: cursor, organizationId });
      if (!cursorRow) throw new AppError('INVALID_AUDIT_CURSOR', 'Audit log cursor is invalid.', 400);
      query.andWhere('(audit.createdAt < :createdAt OR (audit.createdAt = :createdAt AND audit.id < :cursor))', {
        createdAt: cursorRow.createdAt,
        cursor,
      });
    }
    const rows = await query.getMany();
    const items = rows.slice(0, pageSize);
    return { items, nextCursor: rows.length > pageSize ? items.at(-1)!.id : null };
  }
}
