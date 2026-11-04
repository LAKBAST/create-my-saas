# Global SaaS administration

The dashboard is available in **Next.js, React Router and Astro**, with each
template's compatible backends. It lets you browse users and, when the backend
provides them, organizations and subscriptions of one instance of the
generated product. Each deployment keeps its own data and administrators; the
dashboard does not connect different generated applications.

## Access

An organization's `owner` and `admin` roles do not grant global access. The
dashboard requires an active account with a verified email and a persisted
global administration grant. No permissions are granted on first sign-up or
through an email configured in the frontend. Sign-up and profile editing do not
allow changing these grants.

Apply the backend migrations before using the dashboard. Grant or revoke the
permission from the backend folder, with the PostgreSQL connection variables
available in the process environment:

NestJS:

```sh
pnpm migration:run
pnpm build
node dist/admin/manage-admin.js grant <user-uuid>
# To revoke:
node dist/admin/manage-admin.js revoke <user-uuid>
```

FastAPI: apply `uv run alembic upgrade heads` and run
`uv run python -m src.modules.admin.manage grant <user-uuid>` or
`uv run python -m src.modules.admin.manage revoke <user-uuid>`.
Fastify: apply `pnpm db:migrate`, build with `pnpm build` and run
`node dist/admin/manage-admin.js grant <user-uuid>` or `revoke <user-uuid>`.

Use the UUID of a registered account whose email is already verified. Without
grants, the dashboard stays disabled for every account. Queries check the
permission on every request, so a revocation does not need to wait for the
access token to expire.

After signing in as an administrator, the navigation shows Administration and
lets you open `/admin` (`/admin/` in Astro). The Next.js and React Router
proxies forward `/api/admin/*` requests to the backend's `/admin/*` with
`API_PROXY_TARGET`. This prefix avoids confusing the frontend page with the
backend endpoints. The generated gateway serves `/admin` from the frontend and
forwards `/api/admin/*` directly to the API's `/admin/*`.

FastAPI and NestJS declare the `users`, `organizations` and `subscriptions`
resources; Fastify declares only `users`. The dashboard hides unavailable
resources, whose totals are `null`, without making up zeros. Astro uses
`PUBLIC_API_BASE_URL` when it is configured and the same-origin
`/api/admin/*` alias otherwise, both with and without the billing extension.
A frontend generated without a backend has no administrative data to query.

## Extension sections (Next.js)

`app/admin/admin-extensions.tsx` is the dashboard's extension point in Next.js.
Community exports `AdminExtensionNavigation`, which renders nothing, and the
page renders it under the header. An extension that adds its own
administration sections declares that file in the `replace` of its
`frontend:nextjs` target and returns the links to its pages. The extension's
pages must check permissions in the backend; the link grants no access.

## Queries and statistics

| View | Data |
| --- | --- |
| Overview | Totals of users, enabled accounts, verified emails, organizations and subscriptions; sign-ups during the selected period |
| Distribution | Number of subscriptions per plan and per status |
| Users | Name, email, status, verification and sign-up date |
| Organizations | Name, slug, creation date and number of members |
| Subscriptions | Organization, provider, plan, status, seats, period and scheduled cancellation |

Lists have server-side search and bounded pagination. Responses expose
explicit fields and carry `Cache-Control: private, no-store`. Authentication
data and the payment provider's private identifiers are not part of the
contract.

The overview period measures new sign-ups, not user activity. An enabled
account is not the same as a user active during that period. The subscription
distribution represents the current state, not a historical series.

MRR, collected revenue, churn and product activity are not calculated: they
require additional sources and definitions. PostHog remains a separate optional
integration. The dashboard does not allow suspending users, deleting data,
modifying subscriptions or impersonating sessions either.

## HTTP contract

Every route requires a valid session through `Authorization: Bearer`.

- `GET /admin/access`: returns `{ allowed: boolean, resources: string[] }` to discover access and the available resources.
- `GET /admin/overview?days=30`: overview, with a period of 1 to 365 days.
- `GET /admin/users?page=1&pageSize=25&search=...`.
- `GET /admin/organizations?page=1&pageSize=25&search=...` (FastAPI and NestJS).
- `GET /admin/subscriptions?page=1&pageSize=25&search=...` (FastAPI and NestJS).

Lists return `{ items, total, page, pageSize }`, with at most 100 items per
page. Without the global permission, data queries respond
`403 PLATFORM_ADMIN_REQUIRED`. A missing or invalid session cannot query data
even when calling the API directly.

## Checks

From the root, `npm run test:e2e:admin` runs the Next.js browser tests. React
Router and Astro include their own suites in `test/` and
`playwright.admin.config.mjs`. After installing the frontend dependencies and
Playwright with Chromium, run from the repository root:

```sh
npx playwright test --config templates/frontend/react-router-starter/playwright.admin.config.mjs
```

For Astro, go to `templates/frontend/astro-starter` and run
`npx playwright test --config playwright.admin.config.mjs`.
The suites use mocked responses to verify interface states and permissions,
and a local test API to check the real proxies.

These tests do not replace backend checks: the FastAPI, NestJS and Fastify
tests cover authorization, queries and global grants. See each starter's
commands and check the migrations on PostgreSQL before enabling the dashboard
in a real deployment. See also [the deployment guide](./deployment.md).
