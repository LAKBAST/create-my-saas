import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';
import { Subscription } from '../billing/subscription.entity';
import { PlatformAdmin } from './platform-admin.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PlatformAdminGuard } from './platform-admin.guard';

@Module({
  imports: [TypeOrmModule.forFeature([PlatformAdmin, User, Organization, Subscription])],
  controllers: [AdminController], providers: [AdminService, PlatformAdminGuard],
})
export class AdminModule {}
