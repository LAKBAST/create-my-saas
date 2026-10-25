# FastAPI SaaS starter

This template provides a modular SaaS API: password and token authentication, rotating
refresh sessions, one-use verification/recovery tokens, profiles, organizations with
RBAC invitations, organization audit logs, Stripe Checkout/Portal billing with verified webhooks, entitlements and trusted usage recording, and Redis-backed rate limiting.

## Capacidades y compatibilidad

FastAPI implementa todas las capacidades declaradas en `template.manifest.json`,
incluidos usuarios, organizaciones, RBAC, Stripe, OAuth de Google y GitHub, y
migraciones PostgreSQL. Es compatible con los frontends Next.js, React Router y
Astro; Astro requiere `--feature billing` para usar organizaciones y facturación.

## Requisitos

- Python 3.13 o posterior y `uv`.
- PostgreSQL accesible mediante `DATABASE_URL`.
- Redis cuando se activen límites compartidos; es obligatorio en staging y producción.

## Desarrollo local

Copy `.env.example` to `.env`, set a real `SECRET_KEY` and database URL, then install
the project dependencies with `uv sync`. Apply the initial schema with the
command below; `heads` also applies migrations that selected extensions add
on their own Alembic branches:

```sh
uv run alembic upgrade heads
uv run fastapi dev main.py
```

## Configuración

Copia `.env.example` a `.env`. `DATABASE_URL`, `SECRET_KEY`, `FRONTEND_URL` y
`CORS_ORIGINS` son obligatorias. La infraestructura, correo, OAuth, Redis y
Stripe se configuran con las variables documentadas en `.env.example`.

## Verificación

Run the dependency-free test entry point after syncing with:

```sh
uv run python -m unittest discover -s tests
```

## Infrastructure contract

See [`../backend-infrastructure-contract.md`](../backend-infrastructure-contract.md) for
the settings and operational behavior shared with the Nest starter. FastAPI connects to
PostgreSQL through `postgresql+asyncpg://`; migrations intentionally use the synchronous
`postgresql+psycopg://` driver because Alembic executes schema DDL synchronously.
`GET /health` is a dependency-free liveness probe. `GET /ready` checks
PostgreSQL and, when rate limiting is enabled, Redis; failed or timed-out
dependencies return a structured `503 SERVICE_NOT_READY` response.

`TRUST_PROXY_HEADERS` is off by default. Enable it only with explicit
`TRUSTED_PROXY_IPS`; then Uvicorn accepts `X-Forwarded-For` and
`X-Forwarded-Proto` only from those peers, and the rate limiter uses that validated client
IP. Do not enable it with a wildcard.

The general limiter defaults to 30 requests per 60 seconds for each client IP,
method, and route. Login, registration, password-reset requests, and reset
confirmation each use an independent stricter bucket configured with
`AUTH_RATE_LIMIT_REQUESTS` (default `5`) and
`AUTH_RATE_LIMIT_WINDOW_SECONDS` (default `60`).

## Integration boundaries

Email endpoints never return opaque tokens. Configure `EMAIL_DELIVERY_URL` and
`EMAIL_DELIVERY_TOKEN` to send reset, verification, and invitation links through the
shared authenticated HTTPS adapter; production and staging refuse to start without
them. The adapter receives `POST` JSON `{ to, subject, text }` with a Bearer token and
a 10-second timeout. In development and tests, leaving both values empty suppresses
delivery. Google and GitHub OAuth use signed state, PKCE, a stable provider
subject persisted in `oauth_accounts`, and verified provider
email; callbacks write the refresh credential only as an HttpOnly cookie before a
token-free redirect to the frontend. Provider client credentials remain environment
values. Redis is installed by default. Production and staging require
an available `rediss://` endpoint; development can fall back to an in-process limiter
when Redis is deliberately unavailable.

## Límites deliberados

No incorpora entidades ni reglas de negocio del producto final. La configuración
de Stripe, correo y proveedores OAuth pertenece a cada despliegue; sin sus
credenciales, esas integraciones permanecen desactivadas.

## Sensitive-action audit log

FastAPI records successful invitation creation/acceptance, role changes, member
removal, ownership transfers, and Stripe Checkout/Portal creation in the
append-only `audit_logs` table. Owners and administrators can read the newest
events through `GET /organizations/{organizationId}/audit-logs`; `limit` is 50
by default (100 maximum) and `cursor` continues from `nextCursor`.

The log is enabled by default. Set `AUDIT_LOG_ENABLED=false` to stop recording
new events without changing business operations, removing the table, or hiding
historical events. Set it back to `true` to resume recording; no migration is
needed.

Each event stores the organization, actor, action, target, timestamp, and only
action-specific allowlisted metadata. Invitation tokens and hashes, request
bodies, credentials, Stripe customer/session/subscription IDs, payment methods,
and card data are never audit metadata. The invited email is retained for
incident investigation, so define retention/export rules appropriate to the
product before using the log for enterprise or compliance purposes.

## Precios y nombres visibles de los planes

`STRIPE_PRICE_PLANS` admite `labels` opcional por plan, un objeto de textos cuyas
claves deben existir en `entitlements`. Los planes sin `labels` siguen siendo válidos.

```dotenv
STRIPE_PRICE_PLANS={"price_example":{"name":"Pro mensual","entitlements":{"store.pro-api-keys":null},"labels":{"store.pro-api-keys":"API keys"}}}
```

`GET /billing/organizations/{id}/configuration` devuelve siempre `labels` (`{}`
si se omite) y `price` por plan. El precio se consulta en Stripe con `Price.retrieve`
y se guarda en memoria durante diez minutos por Price ID y credencial. Cada
proceso mantiene su propia caché. El importe no se configura en este JSON:
`price` tiene la forma `{ "unitAmount": 2900, "currency": "eur", "interval": "month", "intervalCount": 1 }`.
`unitAmount` está en la unidad mínima de la moneda. El intervalo es `month`,
`year`, `week`, `day` o `null` para pagos únicos (con `intervalCount: 1`).
Si faltan credenciales, Stripe falla o el precio no tiene importe fijo,
`price` es `null`; la ruta sigue respondiendo correctamente. Los clientes
ocultan el precio ausente y usan la clave del entitlement si no hay etiqueta.
Next.js, React Router y Astro muestran el importe con formato `es-ES` y el
intervalo en español. Esto sólo añade información visible: Checkout conserva
el flujo de suscripción existente.
