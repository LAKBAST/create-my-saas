---
title: Templates
description: Available backends and frontends and which combinations the CLI supports.
---

Every project is made of a backend, a frontend or both. You can see the exact
catalog for your version with `--list`.

## Backends

| ID | Stack | What's included |
| --- | --- | --- |
| `fastapi` | Python | Browser sessions, CSRF, users, organizations, RBAC, audit log, recovery and verification, OAuth and billing. |
| `nestjs` | TypeScript | Modular API with the same functional contract as FastAPI. |
| `fastify` | TypeScript | Lightweight API with PostgreSQL, sessions, CSRF, recovery, email verification and Google and GitHub OAuth. No organizations or Stripe Billing for now. |

## Frontends

| ID | Stack | What's included |
| --- | --- | --- |
| `nextjs` | Next.js | Dashboard with browser sessions, protected routes and account flows. |
| `react-router` | React Router (Framework Mode) | React dashboard with server rendering, protected routes and a same-origin API proxy. |
| `astro` | Astro | Marketing, docs and blog site with a light authenticated area. Optional billing. |

## Compatibility

The CLI compares the capabilities declared in each `template.manifest.json`
before writing files:

- The **Next.js** and **React Router** dashboards need organizations and
  Stripe Billing, so they require **FastAPI** or **NestJS**.
- **Astro** works with all three backends. To add billing, use
  `--feature billing`, available with FastAPI and NestJS.
- **Fastify** can be generated alone or with Astro and only supports the
  `individual` product model.

## Examples

```sh
# Full stack
npx @lakbast/create-my-saas@latest my-saas --backend fastapi --frontend react-router

# Astro site with billing
npx @lakbast/create-my-saas@latest my-saas --backend nestjs --frontend astro --feature billing

# API only
npx @lakbast/create-my-saas@latest api-only --backend fastapi

# Public site only
npx @lakbast/create-my-saas@latest public-site --frontend astro
```

For details on what each template covers, see
[template parity](../../reference/template-parity/).
