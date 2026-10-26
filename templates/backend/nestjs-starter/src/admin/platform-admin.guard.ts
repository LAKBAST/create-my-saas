import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppError } from '../common/errors/app.error';
import { User } from '../users/user.entity';
import { AdminService } from './admin.service';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly admin: AdminService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<{ user?: User }>();
    if (!await this.admin.hasAccess(user)) {
      throw new AppError('PLATFORM_ADMIN_REQUIRED', 'Platform administrator access is required.', 403);
    }
    return true;
  }
}
