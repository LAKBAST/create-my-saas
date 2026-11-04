# Product models

Community lets you choose how customers use a SaaS. This capability belongs to
the authentication, isolation and billing base of a single product; it is not
the multi-product catalog or the management of several independent
subscriptions, which belong to Pro.

## Selection

With the repository CLI (commands from its root):

```sh
node packages/cli/bin/create-my-saas.js personal --backend fastapi --frontend nextjs --product-model individual
node packages/cli/bin/create-my-saas.js teams --backend nestjs --frontend react-router --product-model teams
node packages/cli/bin/create-my-saas.js mixed --backend nestjs --frontend astro --feature billing --product-model mixed
```

| Model | Sign-up and usage | Billing |
| --- | --- | --- |
| `individual` | Account and automatic personal workspace, without creating an organization manually | Subscription of the personal workspace |
| `teams` | Explicitly created organizations, members, invitations and roles | One subscription per organization |
| `mixed` | Automatic personal workspace and the option to create teams | The personal subscription and each team's subscriptions are independent |

FastAPI and NestJS support all three models and keep `teams` as the default for
projects that do not select one. Fastify only supports `individual`, without
organizations or billing. Template combinations are still subject to their
capabilities: choosing `individual` does not add Stripe to Fastify. Fastify
combines with Astro; Next.js and React Router require organizations and Stripe
even when `individual` is selected. See the
[catalog and compatibility](./template-manifests.md).
Explicit selection requires a backend; a public Astro site without an API does
not need an account model.

In projects with a backend, the CLI stores `productModel` in
`.create-my-saas.json` with schema 4 and writes `PRODUCT_MODEL` to the backend
and deployment environment examples. Copy that value to the service's real
configuration. Frontends discover the model from the API, avoiding a second
setting that could contradict it. Astro's billing interface is added with
`--feature billing`; its base mode still only offers the light authenticated
area.

## Internal personal workspace

A personal workspace reuses organizations as the internal boundary for data
and billing, but has an exclusive personal owner, protected by a unique
constraint in the database. Individual customers do not go through a manual
company creation step or need to manage members.

Inviting other users to, sharing or transferring a personal workspace is not
allowed. The checks happen in the backend; hiding interface controls is not the
protection. In individual mode, creating teams through a direct API request is
not allowed either.

New password and OAuth sign-ups prepare the personal workspace when
appropriate. The authenticated `POST /workspaces/bootstrap` initializes an
existing account's context idempotently. Requests include the session Bearer
and, with FastAPI, the CSRF header taken from the session cookie, as the
bundled clients do. Its contract is:

```json
{
  "model": "mixed",
  "personalWorkspace": { "id": "uuid", "name": "Personal", "slug": "personal-uuid" },
  "teams": [],
  "billingSupported": true
}
```

In `teams`, `personalWorkspace` is `null`; in Fastify it is also `null`,
because the user's identity is already the personal scope, and
`billingSupported` is `false`. The interfaces keep a fallback to the previous
flow if an older backend does not implement the endpoint.

## Subscriptions and model changes

In mixed mode, selecting the personal context or a team changes which
subscription is queried and managed. Creating a team does not convert, copy or
move the personal subscription and does not start a second charge
automatically. Each purchase requires its own explicit Checkout.

To deactivate an account with a renewing personal Stripe subscription, its
renewal must first be cancelled through the billing portal. The API responds
`409 ACTIVE_PERSONAL_SUBSCRIPTION` if the subscription is still renewing; free
accounts and subscriptions with a scheduled cancellation can be deactivated if
they pass the other checks. Being the last active owner of a team also blocks
deactivation with `409 LAST_ACTIVE_OWNER`: transfer its ownership to another
active member first. Deactivating an account does not cancel subscriptions
automatically.

Migrations keep existing organizations as teams. They do not reassign their
data, members or subscriptions. Changing `PRODUCT_MODEL` is not a tool for
migrating customers or subscriptions; review those operational changes
explicitly and keep the existing data.

Upgrading keeps the model recorded in schema 4. Older manifests are still
supported: full projects keep their teams flow and Fastify its individual
scope. Upgrade and apply the migrations before serving a version that uses
personal workspaces.

## When an organization is needed

| Action | individual | mixed | teams |
| --- | --- | --- | --- |
| View landing page and plans | No | No | No |
| Purchase | Automatic personal workspace | Personal by default; organization to buy for a team | Yes, the subscription belongs to the team |
| Invite | Not available | Required for the team | Required for the team |
| Manage | Personal account and plan | Personal account; organization to manage a team | Organization to manage the team |

The personal workspace is an internal data boundary, not an organization the user has to create. In teams, the need for one is explained at purchase time.
