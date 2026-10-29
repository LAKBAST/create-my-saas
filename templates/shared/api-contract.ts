// Public Community API shapes. Backends may use snake_case on the wire;
// frontend adapters normalize those fields before exposing these types.
export type ProductModel = 'individual' | 'teams' | 'mixed';
export type OAuthProvider = 'google' | 'github';
export type User = {
  id: string; name: string; email: string; emailVerified: boolean; isActive: boolean;
  avatarUrl?: string | null;
};
export type UserWire = {
  id: string; name: string; email: string;
  emailVerified?: boolean; email_verified?: boolean;
  isActive?: boolean; is_active?: boolean;
  avatarUrl?: string | null; avatar_url?: string | null;
};
export type Authentication = { accessToken: string; user: User };
export type AuthenticationWire = { accessToken?: string; access_token?: string; user: UserWire };
export type RegisterInput = { name: string; email: string; password: string };
export type LoginInput = { email: string; password: string };
export type ChangePasswordInput = { currentPassword: string; newPassword: string };
export type ApiErrorBody = { error?: { code?: string; message?: string } };

export type Organization = { id: string; name: string; slug: string };
export type WorkspaceContext = {
  model: ProductModel; personalWorkspace: Organization | null; teams: Organization[]; billingSupported: boolean;
};
export type BillingPrice = {
  unitAmount: number; currency: string; interval: 'month' | 'year' | 'week' | 'day' | null; intervalCount: number;
};
export type BillingPlan = {
  priceId: string; name: string; entitlements: Record<string, number | null>;
  labels: Record<string, string>; price: BillingPrice | null;
};
export type BillingConfiguration = { configured: boolean; provider: 'stripe'; usageMeterConfigured: boolean; plans: BillingPlan[] };
export type BillingSubscription = {
  organizationId: string; provider: string; plan: string; status: string; seats: number;
  currentPeriodStart: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean;
  entitlements: Array<{ key: string; limit: number | null; enabled: boolean; source: string; expiresAt: string | null }>;
  usage: Array<{ metric: string; quantity: number }>;
};
export type BillingRedirect = { configured: boolean; url: string | null; reason?: string; sessionId?: string | null };

export type AdminResource = 'users' | 'organizations' | 'subscriptions';
export type AdminAccess = { allowed: boolean; resources?: AdminResource[] };
export type AdminQuery = { page: number; pageSize: number; search: string };
export type AdminOverview = {
  periodDays: number; totalUsers: number; enabledUsers: number; verifiedUsers: number; newUsers: number;
  totalOrganizations: number | null; newOrganizations: number | null; totalSubscriptions: number | null;
  subscriptionsByStatus: Array<{ status: string; count: number }>;
  subscriptionsByPlan: Array<{ plan: string; count: number }>;
};
export type AdminUser = { id: string; email: string; name: string; emailVerified: boolean; isActive: boolean; createdAt: string };
export type AdminOrganization = { id: string; name: string; slug: string; createdAt: string; memberCount: number };
export type AdminSubscription = {
  id: string; organizationId: string; organizationName: string; plan: string; status: string; seats: number;
  provider: string; cancelAtPeriodEnd: boolean; currentPeriodStart: string | null; currentPeriodEnd: string | null;
};
export type AdminPage<T> = { items: T[]; total: number; page: number; pageSize: number };

// Methods and payloads shared by all full backends. Capability-specific
// routes remain optional: Fastify has no organizations, billing or admin API.
export type CoreApi = {
  'POST /auth/register': { input: RegisterInput; output: UserWire | { user: UserWire } };
  'POST /auth/login': { input: LoginInput; output: AuthenticationWire };
  'POST /auth/refresh': { input: void; output: AuthenticationWire };
  'POST /auth/password/change': { input: ChangePasswordInput; output: void };
  'POST /workspaces/bootstrap': { input: void; output: WorkspaceContext };
};
export type OrganizationApi = {
  'GET /organizations': { input: void; output: Organization[] };
  'POST /organizations': { input: { name: string; slug: string }; output: Organization };
};
// Billing paths differ between NestJS and FastAPI. Clients resolve the path,
// while these operation shapes remain the same for either backend.
export type BillingApi = {
  publicPlans: { input: void; output: PublicBillingPlans };
  configuration: { input: { organizationId: string }; output: BillingConfiguration };
  subscription: { input: { organizationId: string }; output: BillingSubscription };
  checkout: { input: { organizationId: string; priceId: string; quantity: number }; output: BillingRedirect };
  portal: { input: { organizationId: string }; output: BillingRedirect };
};
export type AdminApi = {
  access: { input: void; output: AdminAccess };
  overview: { input: { days: number }; output: AdminOverview };
  users: { input: AdminQuery; output: AdminPage<AdminUser> };
  organizations: { input: AdminQuery; output: AdminPage<AdminOrganization> };
  subscriptions: { input: AdminQuery; output: AdminPage<AdminSubscription> };
};
export type ApiCapabilities = {
  backend: 'fastapi' | 'nestjs' | 'fastify' | null;
  productModel: ProductModel | null;
  organizations: boolean; billing: boolean; admin: boolean;
};

/** Storefront data configured locally by the operator. */
export type PublicBillingPlan = { priceId: string; name: string; priceLabel: string | null; labels: string[] };
export type PublicBillingPlans = { plans: PublicBillingPlan[] };
