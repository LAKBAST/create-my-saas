# Troubleshooting

The following messages come from the CLI and the bundled backends. Fields in
`<...>` stand for project-dependent values. Run the commands from the generated
project's root unless another path is given; generation commands run from its
parent directory. The editing examples use PowerShell and `notepad`; you can
swap in your usual editor.

## The frontend is not compatible with the backend

Message from [generator.js](../../packages/cli/src/generator.js):

```text
Error: Frontend "<frontend>" is not compatible with backend "<backend>". Missing backend capabilities: <capabilities>.
```

**Cause:** the backend does not offer every capability the frontend requires.
For example, Next.js and React Router require organizations and Stripe
Billing, which Fastify does not include.

**Fix:** check the templates and choose a compatible combination; for example,
FastAPI with Next.js, or Fastify with Astro without the billing extension.

```sh
npx @lakbast/create-my-saas --list
npx @lakbast/create-my-saas my-saas --backend fastapi --frontend nextjs
# Lightweight alternative, in another destination:
npx @lakbast/create-my-saas my-site --backend fastify --frontend astro
```

## The destination directory already exists

```text
Error: Destination already exists: <absolute-path>
```

**Cause:** the CLI rejects any existing destination, even an empty one, so it
never overwrites files ([generator.js](../../packages/cli/src/generator.js)).

**Fix:** generate into a new path. If you meant to update an already generated
project, use `upgrade`; do not generate over it again.

```sh
npx @lakbast/create-my-saas my-new-saas --backend fastapi --frontend nextjs
# To review an update of the existing project:
npx @lakbast/create-my-saas upgrade ./my-saas --dry-run
```

## No backend or frontend selected

```text
Error: Select at least one template with --backend or --frontend.
```

**Cause:** a destination was given without selecting any layer
([generator.js](../../packages/cli/src/generator.js)).

**Fix:** add at least one of the two options. You can generate an API on its
own.

```sh
npx @lakbast/create-my-saas my-api --backend fastapi
```

## Upgrade finds uncommitted changes in Git

```text
Error: Commit or stash your changes before upgrading (or use --allow-dirty).
```

**Cause:** `upgrade` detects changes through `git status --porcelain`,
including untracked files, and blocks writing. `--dry-run` lets you review the
plan without requiring a clean tree ([upgrade.js](../../packages/cli/src/upgrade.js)).

**Fix:** review the status and stash your changes before applying the upgrade.
Pop the stash after reviewing and committing the upgrade result; popping it
may also require resolving conflicts.

```sh
git status --short
npx @lakbast/create-my-saas upgrade --dry-run
git stash push -u -m "Work before the upgrade"
npx @lakbast/create-my-saas upgrade
git diff
```

`--allow-dirty` skips this protection; it does not resolve or save the
previous changes.

## Upgrade ends with conflicts and exit code 2

The CLI prints its messages in Spanish. The summary contains this heading
(“With conflicts (resolve them before committing)”; the number varies):

```text
Con conflictos (resuélvelos antes de hacer commit) (<cantidad>):
```

And this exact hint (“Look for the <<<<<<< markers in the conflicting files;
binaries leave the new version in <file>.upgrade-new”):

```text
Busca las marcas <<<<<<< en los archivos con conflictos; los binarios dejan la versión nueva en <archivo>.upgrade-new.
```

**Cause:** the local version and the new template changed the same content and
the three-way merge could not resolve it. The CLI returns **2**, also with
`--dry-run` if the plan contains conflicts. Without `--dry-run`, it has already
written the changes and updated the manifest; this is not a pending
`git merge` ([upgrade.js](../../packages/cli/src/upgrade.js), [cli.js](../../packages/cli/src/cli.js)).

**Fix:** if it was a dry run, review the listed paths before applying. If it
was already applied, edit each listed file, resolve the `<<<<<<<`, `=======`
and `>>>>>>>` markers and compare binaries with their `.upgrade-new`. Keep the
version you choose and delete the auxiliary file after reviewing it. Do not
repeat the upgrade as a way of resolving the conflicts. Review and test the
result before adding the resolved paths and committing.

```sh
git diff
git diff --check
git status --short
```

## Doctor cannot find the local configuration

Exact labels shown with the `FIX` prefix:

```text
FIX Backend .env
FIX Frontend .env
FIX Local Compose .env
```

**Cause:** the `.env` files for the selected layers or the one in
`deployment/` are missing. Each line continues with the recommended action.
The checks in this section and the following ones come from
[local-setup.js](../../packages/cli/src/local-setup.js); `doctor` returns 1 if
anything fails and prints `Local project needs attention.`.

**Fix:** run `setup` and check the files without testing the services.
`setup` keeps existing `.env` files; if they already contain wrong values, fix
them with your editor.

```sh
npx @lakbast/create-my-saas setup .
npx @lakbast/create-my-saas doctor . --no-services
```

## Doctor detects an insecure local key

Label: "FIX Local SECRET_KEY is configured".

**Cause:** `SECRET_KEY` is shorter than 32 characters or contains `replace`,
`change-me` or `example`.

**Fix:** generate a key and copy the result into `SECRET_KEY` in
`backend/.env`. If you run the API in Compose, also update `deployment/.env`.

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
notepad backend/.env
notepad deployment/.env
npx @lakbast/create-my-saas doctor . --no-services
```

## Doctor detects a wrong environment or product model

Labels:

```text
FIX Backend uses development mode
FIX Product model matches <model>
```

**Cause:** `APP_ENV` is not `development`, or `PRODUCT_MODEL` does not match
the model recorded in `.create-my-saas.json`. `doctor` is aimed at local
development; it does not validate production deployments.

**Fix:** for the local environment, set `APP_ENV=development` and the
`PRODUCT_MODEL` given in the message, also in `deployment/.env` if you use
Compose. Do not change a real deployment's environment to satisfy `doctor`.

```powershell
Get-Content .create-my-saas.json
notepad backend/.env
notepad deployment/.env
npx @lakbast/create-my-saas doctor . --no-services
```

## Doctor detects a missing or invalid PostgreSQL or Redis URL

Labels (depending on the affected variable):

```text
FIX DATABASE_URL is configured
FIX REDIS_URL is configured
FIX DATABASE_URL has a valid URL
FIX REDIS_URL has a valid URL
```

**Cause:** the variable is missing from `backend/.env` or cannot be parsed as a
URL.

**Fix:** edit the URLs for the local services. FastAPI uses
`postgresql+asyncpg://postgres:postgres@localhost:5432/app`; NestJS and Fastify
use `postgresql://postgres:postgres@localhost:5432/app`. Local Redis uses
`redis://localhost:6379`. Replace the credentials, host, port and database if
your setup differs.

```powershell
notepad backend/.env
npx @lakbast/create-my-saas doctor . --no-services
```

## Doctor cannot connect to PostgreSQL or Redis

Labels:

```text
FIX DATABASE_URL host responds on TCP
FIX REDIS_URL host responds on TCP
```

**Cause:** the URL's host and port do not respond over TCP within the timeout.
Usually the local services have not been started yet.

**Fix:** from the project root, start PostgreSQL and Redis with the local
configuration created by `setup` and check them again.

```sh
cd deployment
docker compose -f compose.yaml -f compose.dev.yaml --env-file .env up -d postgres redis
cd ..
npx @lakbast/create-my-saas doctor .
```

If they keep failing, check the host and port in `backend/.env`. An `OK` result
only confirms TCP connectivity: it does not validate authentication, TLS or
migrations. `--no-services` skips the connection, so it does not prove
availability either.

## Doctor detects a wrong frontend public URL or proxy

Labels:

```text
FIX Frontend public URL is configured
FIX Frontend API proxy matches the selected backend
```

**Cause:** the public URL is empty or contains `example.com`, or
`API_PROXY_TARGET` does not match the selected backend.

**Fix:** in `frontend/.env`, set the local public URL `http://localhost:3000`
in the matching variable: `NEXT_PUBLIC_SITE_URL` for Next.js,
`VITE_PUBLIC_SITE_URL` for React Router or `PUBLIC_SITE_URL` for Astro. When
running on the host, the proxy must be `http://localhost:8000` (FastAPI),
`http://localhost:3001` (NestJS) or `http://localhost:3002` (Fastify). The
proxy is only checked if a backend was selected.

```powershell
notepad frontend/.env
npx @lakbast/create-my-saas doctor . --no-services
```

## The backend rejects Redis without TLS in staging or production

FastAPI and NestJS print:

```text
RATE_LIMIT_ENABLED and a TLS REDIS_URL (rediss://) are required in production.
```

Fastify prints:

```text
RATE_LIMIT_ENABLED and a TLS REDIS_URL (rediss://) are required in staging and production.
```

**Cause:** in all three backends, the startup validation applies to both
`staging` and `production`, even though the first two messages only mention
production. Redis with TLS is missing or the distributed rate limit is
disabled.

**Fix:** provision Redis with TLS and set `RATE_LIMIT_ENABLED=true` and
`REDIS_URL=rediss://<user>:<password>@<host>:<port>` in the deployment
environment with the provider's real data. Changing only a URL's prefix does
not enable TLS on the server. If you use the generated Compose, edit
`deployment/.env` and recreate the API from the project root:

```powershell
notepad deployment/.env
docker compose -f deployment/compose.yaml --env-file deployment/.env up -d --force-recreate api
docker compose -f deployment/compose.yaml --env-file deployment/.env logs --tail 100 api
```

The `compose.dev.yaml` override uses Redis without TLS and is local only.
Sources: [FastAPI settings](../../templates/backend/fastapi-starter/src/core/config/settings.py),
[NestJS config](../../templates/backend/nestjs-starter/src/config.ts) and
[Fastify config](../../templates/backend/fastify-starter/src/config.ts).

## The backend rejects unconfigured email

Startup message common to all three backends:

```text
EMAIL_DELIVERY_URL (HTTPS) and EMAIL_DELIVERY_TOKEN are required in staging and production.
```

**Cause:** in `staging` or `production`, an HTTPS delivery URL or the token is
missing. Validation prevents starting without that configuration. In addition,
secure delivery rejects a missing configuration in those environments: FastAPI
and NestJS use "Secure email delivery is not configured."; Fastify uses
"Secure email delivery is unavailable.".

**Fix:** configure an email service that accepts the starter adapter's
contract, with `EMAIL_DELIVERY_URL=https://<real-endpoint>` and
`EMAIL_DELIVERY_TOKEN=<real-token>`. The adapter sends a JSON POST with `to`,
`subject`, `text` and, when applicable, `html` and `from`, authenticated
through `Authorization: Bearer`. Add `EMAIL_FROM` if the provider requires a
sender. For Compose, edit the environment and recreate the API:

```powershell
notepad deployment/.env
docker compose -f deployment/compose.yaml --env-file deployment/.env up -d --force-recreate api
docker compose -f deployment/compose.yaml --env-file deployment/.env logs --tail 100 api
```

In development, a missing configuration may suppress sending; starting locally
does not prove that email is delivered. Sources: the configurations linked in
the previous problem and the adapters for
[FastAPI](../../templates/backend/fastapi-starter/src/core/email.py),
[NestJS](../../templates/backend/nestjs-starter/src/auth/secure-email.service.ts) and
[Fastify](../../templates/backend/fastify-starter/src/email.ts).

## Stripe Checkout, Portal or webhooks are disabled

FastAPI and NestJS messages:

```text
Stripe billing is not configured.
Stripe webhooks are not configured.
```

**Cause:** Stripe is optional in these two backends, also in `staging` and
`production`. Without a complete configuration, Checkout returns
`{"configured":false,"url":null,"sessionId":null}` and Portal returns
`{"configured":false,"url":null,"reason":"Stripe billing is not configured."}`.
Webhooks without a secret return HTTP 503 with the code
`BILLING_NOT_CONFIGURED`. This alone does not block startup. Fastify does not
include Stripe Billing.

A partial configuration does block startup with:

```text
STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be configured together.
```

**Fix:** to enable payments, configure both keys and a non-empty
`STRIPE_PRICE_PLANS`. Use real price identifiers and the webhook endpoint
secret for the same Stripe environment. For example, the plans value can look
like `{"price_REAL":{"name":"pro","entitlements":{"api_calls":10000}}}`,
replacing `price_REAL`. Register your backend's webhook according to its README
and recreate the API to load the variables:

```powershell
notepad deployment/.env
docker compose -f deployment/compose.yaml --env-file deployment/.env up -d --force-recreate api
docker compose -f deployment/compose.yaml --env-file deployment/.env logs --tail 100 api
```

If you are not going to take payments, leave both keys unconfigured and treat
`configured:false` as a disabled integration. Sources:
[FastAPI service](../../templates/backend/fastapi-starter/src/modules/billing/service.py),
[NestJS service](../../templates/backend/nestjs-starter/src/billing/billing.service.ts)
and their configuration validations linked above.
