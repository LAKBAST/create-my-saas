# Template parity

FastAPI defines the reference HTTP contract. The scope differences declared in
the manifests remain intentional.

## Global administration

All three backends offer `admin.platform.read`: global grants separate from
organization roles and `/admin/*` query endpoints. All three frontends offer
the `admin.platform.ui` interface at `/admin`, with a `/api/admin/*` proxy to
the backend. Access requires an active account, a verified email and a
persisted grant.

This capability does not change the compatible combinations. The access
endpoint declares the resources: FastAPI and NestJS include users,
organizations and subscriptions; Fastify includes users. Astro works with and
without billing. The overview represents current data and sign-ups per period,
without attributing activity or revenue metrics to them.
See [the administration guide](./admin-dashboard.md).

## NestJS contract

FastAPI and NestJS declare `organizations.creation-provenance`: both store the
creator of organizations and personal workspaces, independently of the current
owner. FastAPI already uses `created_by_id` with `NOT NULL` and a foreign key
to `users`; its manifest now announces that existing capability.

Organizations keep `createdById` (`created_by_id` in PostgreSQL), like
FastAPI's creator field. It is set when creating a team or personal workspace
and does not change when ownership is transferred. The migration
`1773140400000-add-organization-creator.ts` adds a foreign key to `users`,
backfills it with the oldest `owner` membership (tie-break by id) and applies
`NOT NULL` only if no ownerless cases remain. If there are any, it logs their
count and leaves `NULL`, without making up users; the operator must review
those cases before enforcing the constraint. The model accepts those unknown
historical values and new creations always store the real actor.

| Operation | Shared contract |
| --- | --- |
| Create and list organizations | 201 and 200; objects with `id`, `name`, `slug` |
| Slug taken | 409, `SLUG_ALREADY_EXISTS` |
| Invite | 201, `{ id, accepted: false }`, also on retry |
| Accept invitation | 204, no body |
| List members | `id`, `user_id`, `email`, `name`, `role` |
| Change or remove member | The membership identifier identifies the target |
| Non-existent member | 404, `MEMBERSHIP_NOT_FOUND` |
| Remove owner | 409, `OWNER_REQUIRED` |
| Organization access | 403, `MEMBERSHIP_REQUIRED` or `INSUFFICIENT_ROLE` |
| Deactivate account | `POST /users/me/deactivate`, 204 |
| Change password | `POST /users/me/password`, 204 |
| Request recovery | `POST /users/password-reset/request`, 202 and `{ accepted: true }` |
| Confirm recovery | `POST /users/password-reset/confirm`, 204 |
| Request verification | `POST /users/email-verification/request`, 202 and `{ accepted: true }` |
| Confirm verification | `POST /users/email-verification/confirm`, 200 with the public user |
| Invalid recovery or verification tokens | 400, `INVALID_RESET_TOKEN` or `INVALID_VERIFICATION_TOKEN` |
| Public user | `id`, `email`, `name`, `email_verified`, `is_active` |
| Session | `accessToken`, `access_token`, `token_type`, `expires_in`, `user`; refresh only in a cookie |
| Subscription | `GET /billing/organizations/:id`; includes `seats` and avoids exposing internal fields |
| Configuration, Checkout and portal | `/billing/organizations/:id/configuration`, `/checkout`, `/portal`; 200 responses |
| OAuth start with redirect | `GET /auth/oauth/:provider/start`, 307 |
| Invalid payload | 422, `HTTP_422`, without echoing credentials |
| Billing provider error | 502, `BILLING_PROVIDER_ERROR` |

`DELETE /users/me` and `/organizations/:id/billing/*` are kept as deprecated
aliases of the same service. The existing authentication routes under `/auth`
and the user identifier previously accepted in member operations also keep
working. Clients keep their fallbacks with a retry after a 404. Webhooks stay
at `/billing/webhooks/stripe`.

Subscription seats require the migration
`1773140100000-add-subscription-seats.ts`; existing subscriptions start with
one seat and Stripe notifications update the quantity.

## Production configuration

In `staging` and `production`, NestJS and Fastify require a secret of at least
32 characters and reject the same example values as FastAPI:

- `development-only-secret-not-for-production-32b`
- `change-me-in-production`
- `replace-with-a-long-random-secret`

They reject a `DATABASE_URL` containing `localhost`. No ban on `127.0.0.1` is
added: FastAPI does not have one at the moment. The previous SSL, cookie,
email and Redis requirements are kept.

## Page review

| Page or state | Next.js | React Router | Base Astro | Astro with billing |
| --- | --- | --- | --- | --- |
| Private home | `/` | `/app` | `/app/` | `/app/` |
| Account | `/account` | `/account` | `/account/` | `/account/` |
| Settings | `/settings` | `/settings` | `/settings/` | `/settings/` |
| Sign-in and sign-up | `/login`, `/register` | The same | The same with a trailing `/` | The same with a trailing `/` |
| Recovery and new password | `/forgot-password`, `/reset-password` | The same | The same with a trailing `/` | The same with a trailing `/` |
| Email verification | `/verify-email` | The same | `/verify-email/` | `/verify-email/` |
| OAuth return | `/auth/oauth/callback` | The same | The same with a trailing `/` | The same with a trailing `/` |
| Billing | `/billing` | `/billing` | Out of scope | `/billing/` |
| Create an organization from Billing (`teams` or `mixed`) | Yes | Yes | Out of scope | Yes |
| Public landing page | No, private home | `/` | `/` | `/` |
| Public pricing, docs and blog | No | No | `/pricing`, `/docs`, `/blog` | The same |

Astro's public landing page and content pages are capabilities of that
template; they are not private screens missing from Next.js.

Password validation, recovery and verification notices, the account's active
state and the texts shown during requests are aligned. Astro adds the success
states, the initial progress and, with the extension, organization creation,
its seats and an explicit presentation of plans and of unconfigured billing.
The subscription status is shown with Spanish labels instead of repeating the
Stripe code in the title. The product name is used in the consent notices; the
privacy and cookie links depend on the URLs configured in each frontend.

React Router keeps the post-sign-up redirect to `/login?registered=1`, which
the browser test checks. Astro keeps its `data-*` state attributes and the
links and behaviour for missing tokens used by that test. The subscription
labels already present in Next.js and React Router are kept; unknown codes
remain visible as a fallback.

## Pro extensions (external reference)

The statements in this section are kept as a historical Pro reference. Their
overlays are not included in this Community repository and must be verified in
the Pro repository before applying them to a current version.

The `app.module.ts` copies in `api-keys` and `background-jobs` apply the same
production rules. They keep the inline validation so they also support
Community 1.4.0, which does not contain `src/config.ts` yet.

The `database/data-source.ts` copy in `api-keys` registers the seats migration
only once. Its inline definition uses the same name and SQL, for the same
compatibility reason. No consumer calls to `DELETE /users/me` or to
`/organizations/:id/billing/*` were found in the extensions.

## Reproducible checks

Install the starter's dependencies before running its commands. The following
rows give the working directory inside the repository; they are not a record
of results from a specific run.

| Directory | Commands |
| --- | --- |
| Root | `npm run validate:templates` and `npm test` |
| `templates/backend/fastapi-starter` | `uv sync --locked` and `uv run python -m unittest discover -s tests` |
| `templates/backend/nestjs-starter` | `pnpm build`, `pnpm test --runInBand` and `pnpm run test:e2e --runInBand` |
| `templates/backend/fastify-starter` | `pnpm run typecheck` and `pnpm test` |
| `templates/frontend/react-router-starter` | `pnpm run typecheck` and `pnpm lint` |
| `templates/frontend/astro-starter` | `pnpm run check` |
| `templates/frontend/nextjs-starter` | `pnpm lint` and `pnpm exec tsc --noEmit` |

For Astro with billing, generate a project with
`--frontend astro --backend fastapi --feature billing`, install its
dependencies and run `pnpm run check` in `frontend/`. The database and Redis
integration tests require the services and variables each suite declares.

From the root, `npm run test:e2e:contract` runs FastAPI + Next.js by default.
For another combination, use the script directly; for example:

```sh
node scripts/e2e-generated-projects.mjs --backend nestjs --frontend astro --feature billing
```

The nine combinations covered by the tests are FastAPI and NestJS with
Next.js, React Router, base Astro or Astro with `billing`, plus Fastify with
base Astro. Not all of them have organization or billing flows. CI job
selection depends on the affected files; check the PR results to see which
suites ran. See also [the API contract](./api-contract.md) and
[template manifests](./template-manifests.md).

## Preserved differences

- Fastify remains a lightweight backend, without organizations, invitations,
  billing or auditing.
- Base Astro does not add organizations or billing; the extension enables them.
- The NestJS role set is kept. FastAPI also supports the billing role;
  extending it would require changing roles, outside the scope of this review.
- Validation keeps each framework's specific rules where they do not affect
  the reviewed public contract; ORMs, internal cookies and the session
  implementation are not unified.
- No policies or legal identity are made up. Notices can link to the real
  privacy and cookie URLs configured by each product.

## Plans storefront

FastAPI and NestJS announce `billing.plans.public` and serve `GET /billing/plans` without a session. Fastify does not offer billing. Next.js and React Router show plans on the landing page; Astro shows them on Pricing and requires the billing feature to purchase. The selection keeps the price through to billing, where the user confirms before opening Stripe.
