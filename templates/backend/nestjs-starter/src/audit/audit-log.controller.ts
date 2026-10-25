import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrganizationRoleGuard } from '../organizations/organization-role.guard';
import { OrganizationRoles } from '../organizations/roles.decorator';
import { AuditLogService } from './audit-log.service';

class AuditQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
  @IsOptional() @IsUUID() cursor?: string;
}

@Controller('organizations/:organizationId/audit-logs')
@UseGuards(JwtAuthGuard, OrganizationRoleGuard)
@OrganizationRoles('owner', 'admin')
export class AuditLogController {
  constructor(private readonly audit: AuditLogService) {}

  @Get()
  list(
    @Param('organizationId') organizationId: string,
    @Query() query: AuditQueryDto,
  ) {
    return this.audit.list(organizationId, query.limit, query.cursor);
  }
}
