# Community typed API contract

`templates/shared/api-contract.ts` is the source of the public types for
authentication, users, workspaces, organizations, billing and administration.
The three frontend templates include an identical copy so they can also be
built on their own; `packages/cli/test/api-contract.test.js` prevents them
from diverging. When you change the contract, update all three copies.

The contract separates the shapes received over HTTP (`UserWire` and
`AuthenticationWire`) from the normalized shapes the pages use (`User` and
`Authentication`). Clients accept `snake_case` and `camelCase` for user and
token fields. The differences between FastAPI and NestJS billing routes are
still handled by the existing adapters.

`CoreApi` describes the operations present in all three backends.
`OrganizationApi` and `BillingApi` describe capabilities Fastify does not
offer: that backend only supports the individual model. `AdminApi` describes
the administrative queries; all three backends offer access, overview and
users, but only FastAPI and NestJS offer organizations and subscriptions.
Astro without the billing extension does not show organization or billing
flows either. The actual capability selection stays in the template manifests
and in the context of `POST /workspaces/bootstrap`. For administration,
`GET /admin/access` announces the available resources. See
[product models](./product-models.md) and
[the administration guide](./admin-dashboard.md).

HTTP tests on generated projects verify the backend and frontend contracts in
the affected combinations. TypeScript checks the three frontend templates;
external responses are still untrusted data, and the adapters validate or
normalize the fields they use before displaying them.

## Public plans

FastAPI and NestJS offer `GET /billing/plans` without a session, with the public rate limit and `Cache-Control: public, max-age=60`. The response contains `plans`, a list of objects with `priceId`, `name`, `priceLabel` (text or null) and `labels` (list of texts). They come from `STRIPE_PRICE_PLANS`; Stripe is not queried and no secrets, customers or internal limits are returned. Fastify lacks the `billing.plans.public` capability.
