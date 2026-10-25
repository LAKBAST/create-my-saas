import { Expose, Transform } from 'class-transformer';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { AppError } from '../common/errors/app.error';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../users/user.entity';
import type { OrganizationRole } from './membership.entity';
import { OrganizationRoleGuard } from './organization-role.guard';
import { OrganizationsService } from './organizations.service';
import { OrganizationRoles } from './roles.decorator';
const memberIdPipe = new ParseUUIDPipe({ exceptionFactory: () => new AppError('HTTP_422', 'The request payload is invalid.', 422) });
class CreateOrganizationDto { @IsString() @MinLength(1) @MaxLength(160) name!: string; @IsString() @Matches(/^[a-z0-9][a-z0-9-]{1,158}[a-z0-9]$/) slug!: string; }
class InviteDto { @IsEmail() @MaxLength(320) email!: string; @Transform(({ value }: { value: unknown }) => { if (value === 'owner') throw new AppError('OWNER_ROLE_PROTECTED', 'Owner invitations are not permitted.', 400); return value; }) @IsIn(['admin', 'member']) role: 'admin' | 'member' = 'member'; }
class AcceptInvitationDto { @IsString() token!: string; }
class ChangeRoleDto { @Transform(({ value }: { value: unknown }) => { if (value === 'owner') throw new AppError('OWNER_ROLE_PROTECTED', 'Owner role cannot be changed through this endpoint.', 400); return value; }) @IsIn(['admin', 'member']) role!: OrganizationRole; }
class TransferOwnershipDto { @Expose() @Transform(({ value, obj }: { value: unknown; obj: { user_id?: unknown } }) => value ?? obj.user_id) @IsUUID() userId!: string; @IsOptional() @IsUUID() user_id?: string; }
@Controller('organizations') @UseGuards(JwtAuthGuard)
export class OrganizationsController {
 constructor(private readonly organizations: OrganizationsService) {}
 @Post() async create(@CurrentUser() user: User, @Body() body: CreateOrganizationDto) { const { id, name, slug } = await this.organizations.create(user, body.name, body.slug); return { id, name, slug }; }
 @Get() async list(@CurrentUser() user: User) { return (await this.organizations.list(user.id)).map(({ id, name, slug }) => ({ id, name, slug })); }
 @Get(':organizationId/members') @UseGuards(OrganizationRoleGuard) members(@Param('organizationId') id: string) { return this.organizations.members(id); }
 @Post(':organizationId/invitations') @UseGuards(OrganizationRoleGuard) @OrganizationRoles('owner', 'admin') @HttpCode(HttpStatus.CREATED)
 invite(@CurrentUser() user: User, @Param('organizationId') id: string, @Body() body: InviteDto) { return this.organizations.invite(id, user.id, body.email, body.role); }
 @Post('invitations/accept') @HttpCode(HttpStatus.NO_CONTENT)
 async accept(@CurrentUser() user: User, @Body() body: AcceptInvitationDto): Promise<void> { await this.organizations.acceptInvitation(user, body.token); }
 @Patch(':organizationId/members/:userId') @UseGuards(OrganizationRoleGuard) @OrganizationRoles('owner', 'admin') @HttpCode(HttpStatus.NO_CONTENT)
 async role(@CurrentUser() user: User, @Param('organizationId') id: string, @Param('userId', memberIdPipe) userId: string, @Body() body: ChangeRoleDto): Promise<void> { await this.organizations.changeRole(id, user.id, userId, body.role); }
 @Delete(':organizationId/members/:userId') @UseGuards(OrganizationRoleGuard) @OrganizationRoles('owner', 'admin') @HttpCode(HttpStatus.NO_CONTENT)
 async remove(@CurrentUser() user: User, @Param('organizationId') id: string, @Param('userId', memberIdPipe) userId: string): Promise<void> { await this.organizations.removeMember(id, user.id, userId); }
 @Post(':organizationId/ownership/transfer') @UseGuards(OrganizationRoleGuard) @OrganizationRoles('owner') @HttpCode(HttpStatus.NO_CONTENT)
 async transferOwnership(@CurrentUser() user: User, @Param('organizationId') id: string, @Body() body: TransferOwnershipDto): Promise<void> {
  await this.organizations.transferOwnership(id, user.id, body.user_id ?? body.userId ?? '');
 }
}
