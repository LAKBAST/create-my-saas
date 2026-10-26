import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../users/user.entity';
import { AdminListQuery, AdminOverviewQuery } from './admin-query.dto';
import { AdminService } from './admin.service';
import { PlatformAdminGuard } from './platform-admin.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('access') access(@CurrentUser() user: User) { return this.admin.hasAccess(user).then((allowed) => ({ allowed })); }
  @Get('overview') @UseGuards(PlatformAdminGuard)
  overview(@Query() query: AdminOverviewQuery) { return this.admin.overview(query.days); }
  @Get('users') @UseGuards(PlatformAdminGuard)
  users(@Query() query: AdminListQuery) { return this.admin.listUsers(query); }
  @Get('organizations') @UseGuards(PlatformAdminGuard)
  organizations(@Query() query: AdminListQuery) { return this.admin.listOrganizations(query); }
  @Get('subscriptions') @UseGuards(PlatformAdminGuard)
  subscriptions(@Query() query: AdminListQuery) { return this.admin.listSubscriptions(query); }
}
