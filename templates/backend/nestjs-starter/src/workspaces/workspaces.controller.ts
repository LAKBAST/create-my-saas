import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../users/user.entity';
import { ProductModel, workspaceContext } from './personal-workspace';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly source: DataSource, private readonly config: ConfigService) {}
  // Bearer authentication matches the other organization mutation endpoints.
  @Post('bootstrap') @HttpCode(200)
  bootstrap(@CurrentUser() user: User) {
    return this.source.transaction((manager) => workspaceContext(manager, user, this.config.get<ProductModel>('PRODUCT_MODEL', 'teams'), this.source.options.type === 'postgres'));
  }
}
