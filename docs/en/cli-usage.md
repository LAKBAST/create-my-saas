# CLI usage

Install and run the published version with `npx`:

```sh
npx @lakbast/create-my-saas@latest my-saas --backend nestjs --frontend nextjs
```

To develop the CLI from this checkout:

```sh
node packages/cli/bin/create-my-saas.js my-saas --backend nestjs --frontend nextjs
node packages/cli/bin/create-my-saas.js my-saas --backend nestjs --frontend astro --feature billing
```

You can also generate a single layer:

```sh
node packages/cli/bin/create-my-saas.js api-only --backend fastapi
node packages/cli/bin/create-my-saas.js public-site --frontend astro
```

To see the available catalog:

```sh
node packages/cli/bin/create-my-saas.js --list
```

## Preparing a local project

After generating it, the CLI can create the local configuration files without
overwriting any that already exist:

```sh
node packages/cli/bin/create-my-saas.js setup ./my-saas
node packages/cli/bin/create-my-saas.js doctor ./my-saas --no-services
```

`setup` creates `backend/.env`, `frontend/.env` and `deployment/.env` depending
on the selected layers. It generates a random `SECRET_KEY` for development,
aligns the product model with the manifest and uses the local URLs of the
selected backend. These files are covered by `.gitignore`; do not add them to
the repository. If any of them already exists, it is kept. `deployment/.env`
is for the local Compose setup; do not copy `.env.production.example` over it.
For production, follow [the deployment guide](deployment.md).

With PostgreSQL and Redis running, run `doctor` without `--no-services` to also
check that their ports respond. That TCP check does not validate user,
password or migrations; `/ready` verifies the API's actual availability.
In development, transactional emails are skipped if you do not configure a
delivery adapter. Configure one to test real verification and recovery.

## Loading demo data

With the local API running and `/ready` available:

```sh
node packages/cli/bin/create-my-saas.js seed ./my-saas
```

`seed` creates two users (`demo-owner@example.com` and
`demo-member@example.com`) and prepares the owner's personal workspace if the
model is `individual` or `mixed`. In `teams` and `mixed` it also creates a
`Demo Workspace` team owned by the first user. The second user is for testing
access with another account; it is not given a team role. Running it again
reuses the accounts and the team.

The random password is saved to `./my-saas/.env.demo`, excluded by the
generated `.gitignore`. `seed` only acts with `APP_ENV=development`, local
PostgreSQL and the email adapter disabled; it never targets an external API.
The credentials file lets you repeat the command and must not be copied to a
deployment. Frontend-only projects have no backend to seed.

## Individual, teams or mixed model

Since version 1.8.0, the CLI supports `--product-model individual|teams|mixed`:

```sh
node packages/cli/bin/create-my-saas.js personal --backend fastapi --frontend nextjs --product-model individual
```

Individual mode prepares a personal workspace automatically and lets users
manage their subscription without creating an organization manually. Mixed
mode adds teams with separate subscriptions. FastAPI and NestJS keep `teams`
as the default; Fastify only supports `individual` and does not include
billing. See [the models and their compatibility](product-models.md).

The CLI does not overwrite existing directories. Each generated project
includes `.create-my-saas.json` with the IDs and versions of the chosen
templates, and does not copy dependencies, virtual environments or local build
artifacts.

## Combinations

| Need | Recommended combination |
| --- | --- |
| TypeScript dashboard with a full API | `--backend nestjs --frontend nextjs` |
| Python dashboard with a full API | `--backend fastapi --frontend nextjs` |
| React app with SSR/Framework Mode and billing | `--backend nestjs --frontend react-router` or `--backend fastapi --frontend react-router` |
| Landing page, blog or docs without a private area | `--frontend astro` |
| Astro site with a light private area | `--backend nestjs --frontend astro`, `--backend fastapi --frontend astro` or `--backend fastify --frontend astro` |
| Astro site with organizations and Stripe | `--backend nestjs --frontend astro --feature billing` or `--backend fastapi --frontend astro --feature billing` |
| Lightweight API with full authentication | `--backend fastify` |

Session-based frontends use a same-origin proxy configured through
`API_PROXY_TARGET`. After generating a project, copy its example environment
files and configure secrets, the PostgreSQL URL and any providers you use; see
each starter's README for runtime-specific details.

To update an existing application, see [the upgrade guide](./upgrading.md).
`upgrade` also adds Pro modules to an existing project (`--feature` with
`--extensions-dir`) or changes their version (`--base-extensions-dir` with the
current version and `--extensions-dir` with the new one); see
[Adding or updating Pro modules](./upgrading.md#adding-or-updating-pro-modules).

## Starter references

- [FastAPI](../../templates/backend/fastapi-starter/README.md), [NestJS](../../templates/backend/nestjs-starter/README.md) and [Fastify](../../templates/backend/fastify-starter/README.md).
- [Next.js](../../templates/frontend/nextjs-starter/README.md), [React Router](../../templates/frontend/react-router-starter/README.md) and [Astro](../../templates/frontend/astro-starter/README.md).
- [Common operational contract for the backends](../../templates/backend/backend-infrastructure-contract.md).

## Landing page and plans

Next.js and React Router show a public landing page; Astro offers a public pricing page. With FastAPI or NestJS, configure `STRIPE_PRICE_PLANS` with `name`, `entitlements`, `labels` and, optionally, `priceLabel` to show the storefront without querying Stripe. Purchasing requires a session and confirmation in Billing. To purchase from Astro, add `--feature billing`. Fastify does not offer billing plans.
