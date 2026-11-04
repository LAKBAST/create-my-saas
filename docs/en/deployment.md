# Reproducible deployment

Every generated project includes `deployment/`, `compose.yaml`,
`compose.dev.yaml` and `.env.production.example`. The images and services
adapt to the selected templates: a backend-only project includes the API and
migration; a frontend-only one includes the frontend and gateway; a full one
includes both sides. The TLS gateway is generated when there is a frontend. An
API without a frontend needs an external TLS proxy to be exposed publicly.

The following commands start from the repository root to use the CLI. The
Docker Compose commands run inside the generated project's `deployment/`. They
require Docker with Compose; the CLI requires Node.js 20 or later. See
[the template catalog](./template-manifests.md) to pick a compatible
combination and [product models](./product-models.md) to configure accounts.

## Local development

Generate, prepare the environment files and check their configuration:

```sh
node packages/cli/bin/create-my-saas.js my-saas --backend fastapi --frontend nextjs
node packages/cli/bin/create-my-saas.js setup ./my-saas
node packages/cli/bin/create-my-saas.js doctor ./my-saas --no-services
```

`setup [project]` creates `backend/.env`, `frontend/.env` and `deployment/.env`
depending on the templates present, generates a local secret and keeps existing
files. The default directory for `setup`, `doctor` and `seed` is `.`. `doctor`
checks the files and, unless `--no-services` is passed, the TCP connectivity of
the local PostgreSQL and Redis URLs; it does not verify their credentials.

For the full project in the example, go to `my-saas/deployment/`:

```sh
docker compose -f compose.yaml -f compose.dev.yaml --env-file .env up -d postgres redis
docker compose -f compose.yaml -f compose.dev.yaml --env-file .env --profile migrate run --rm migrate
docker compose -f compose.yaml -f compose.dev.yaml --env-file .env up --build api frontend
```

By default the frontend is published at `http://localhost:3000` and the API at
`http://127.0.0.1:8000`. The override uses `APP_ENV=development`, and
PostgreSQL and Redis without TLS. Their data is kept in the `postgres-data` and
`redis-data` volumes; `down -v` deletes them. Do not use this configuration in
production or overwrite the `.env` created by `setup` with the production
example.

`seed [project]` creates demo accounts through an already running local API and
saves the credentials to `.env.demo`, ignored by Git. It requires
`APP_ENV=development`, a local PostgreSQL URL and an empty `EMAIL_DELIVERY_URL`.
It uses the starters' local ports: FastAPI `8000`, NestJS `3001` and Fastify
`3002`. The bundled Compose publishes the API on `8000` by default: to use
`seed` with NestJS or Fastify, set `API_PORT` to the matching port in
`deployment/.env` and recreate the API service. The published Compose ports
are configured with `API_PORT` and `FRONTEND_PORT`.

## Production

With a backend, the recipe keeps PostgreSQL and Redis outside Compose so you
can use managed services with TLS. Copy `deployment/.env.production.example` to
`deployment/.env` in the production environment, replace every secret and
example URL and configure email delivery. OAuth and Stripe require additional
configuration when used. `PRODUCT_MODEL` must match the model chosen when
generating the project.

With a frontend, provide the certificates to the gateway at
`certs/fullchain.pem` and `certs/privkey.pem`, relative to `deployment/`. Keep
`GATEWAY_IP` and `TRUSTED_PROXY_IPS` consistent. For a full project, run from
`deployment/`:

```sh
docker compose --env-file .env --profile migrate run --rm migrate
docker compose --env-file .env --profile production up -d --build
```

Run `migrate` as a release job before starting the API replicas. A
frontend-only generation does not need that service. In a backend-only
generation, start `api` without the `production` profile and configure the
external TLS proxy over the loopback port, or adjust `API_BIND_ADDRESS` and
`API_PORT`.

The API exposes `/health` to check that the process is alive and `/ready` to
check PostgreSQL and Redis, the latter when the distributed rate limit is
active. Compose uses `/ready` as its healthcheck; when there is an API and a
gateway, the gateway waits for the API to be healthy before routing traffic.

The generated `deployment/README.md` details the recipe for the selected
templates. Also review backups, restore tests and secret rotation for the
managed services before using the deployment with real data.

## Coolify preset

New projects include `deployment/compose.coolify.yaml` and
`deployment/COOLIFY.md`. This preset uses Coolify's Docker Compose from Git
application, with required variables validated through interpolation. Coolify
terminates TLS; the generated HTTP gateway keeps the frontend and API under the
same origin without publishing host ports. PostgreSQL and Redis remain
external. The `migrate` job is run manually once per version before serving
the API. The preset also covers an API without a frontend and static Astro.

The generic Compose recipe is still available. When upgrading existing
projects, `create-my-saas upgrade --dry-run` shows new files or conflicts
before writing. The upgrade preserves `.env` and edited files. See
[Coolify's Compose documentation](https://coolify.io/docs/applications/builds/docker-compose)
to configure the repository file, the variables and the domain.

## Production requirements

Before putting a real SaaS online you still need to connect the final
product's integrations. This is not code missing from the starters: they are
services and credentials that belong to each deployment. Configure PostgreSQL,
Redis with TLS, transactional email delivery and the OAuth credentials for the
providers you offer. If you are going to charge, also configure Stripe, the
allowed prices and the webhook endpoint.

FastAPI, NestJS and Fastify explicitly require the services they depend on in
`staging` and `production` and fail safely if they are missing or unusable. In
particular, rate limits require Redis through `rediss://` and account flows
require authenticated email delivery. FastAPI and NestJS also keep Stripe
Checkout, Portal and webhooks disabled until a valid configuration is provided.
See the generated starter's README and `.env.example` for variable names and
registered callbacks.

See the [common operational contract](../../templates/backend/backend-infrastructure-contract.md) for infrastructure details.
