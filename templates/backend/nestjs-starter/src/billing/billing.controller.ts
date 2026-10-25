import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { OrganizationRoleGuard } from '../organizations/organization-role.guard';
import { OrganizationRoles } from '../organizations/roles.decorator';
import { User } from '../users/user.entity';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@Controller()
@UseGuards(JwtAuthGuard, OrganizationRoleGuard)
@OrganizationRoles('owner', 'admin')
export class BillingController {
  constructor(private readonly billing: BillingService) {}
  // deprecated: /organizations/:organizationId/billing/* aliases are retained for generated clients.
  @Get(['billing/organizations/:organizationId', 'organizations/:organizationId/billing/subscription']) subscription(@Param('organizationId') id: string) { return this.billing.snapshot(id); }
  @Get(['billing/organizations/:organizationId/configuration', 'organizations/:organizationId/billing/configuration']) configuration() { return this.billing.configuration(); }
  @Post(['billing/organizations/:organizationId/checkout', 'organizations/:organizationId/billing/checkout']) @HttpCode(200)
  checkout(@CurrentUser() user: User, @Param('organizationId') id: string, @Body() body: CreateCheckoutDto) { return this.billing.checkout(id, body.priceId, body.quantity, user.id); }
  @Post(['billing/organizations/:organizationId/portal', 'organizations/:organizationId/billing/portal']) @HttpCode(200)
  portal(@CurrentUser() user: User, @Param('organizationId') id: string) { return this.billing.portal(id, user.id); }
}

@Controller('billing/webhooks')
export class BillingWebhookController {
  constructor(private readonly billing: BillingService) {}
  @Post('stripe') @HttpCode(200)
  stripe(@Req() request: Request & { rawBody?: Buffer }, @Headers('stripe-signature') signature?: string) { return this.billing.handleStripeWebhook(request.rawBody, signature); }
}
