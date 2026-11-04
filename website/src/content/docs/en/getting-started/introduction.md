---
title: Introduction
description: What create-my-saas is and what you get when you generate a project.
---

`create-my-saas` is a CLI that generates the foundation of a SaaS product from
versioned backend and frontend templates. Instead of rebuilding
authentication, users, organizations or billing in every project, you pick a
backend and a frontend from the terminal and get a project ready for
development.

## What's included

The common base of the full templates covers:

- secure browser authentication with sessions and CSRF protection;
- users, email verification and account recovery;
- OAuth with Google and GitHub;
- organizations, invitations, roles and permissions (RBAC);
- audit log;
- Stripe Billing with Checkout, Portal and webhooks;
- a [global admin dashboard](../../reference/admin-dashboard/) at `/admin`;
- PostgreSQL with migrations, rate limiting with Redis and a deployment
  recipe with Docker Compose.

Not every combination includes everything: see
[the templates](../../guides/templates/) for what each one covers.

## Principles

- **No black boxes.** Each template is a self-contained project. The CLI only
  composes compatible options, configures the local connection between layers
  and records the selection in `.create-my-saas.json`.
- **Declared compatibility.** Each template declares its capabilities in a
  manifest. The CLI compares them before writing a single file and rejects
  combinations that would not work.
- **The code is yours.** The generated project does not inherit the MIT
  license: it is created as `UNLICENSED` and the templates' notice is kept in
  `THIRD_PARTY_NOTICES.md`.
- **Fail-closed in production.** In `staging` and `production` the backends
  require the services they depend on (PostgreSQL, Redis with TLS, email) and
  refuse to start if they are missing.

## Next steps

- [Install the requirements](../installation/).
- [Generate and start your first project](../quick-start/) in a few minutes.
