---
title: Quick start
description: From zero to a SaaS running locally in a few minutes.
---

This guide generates a project with **NestJS** and **Next.js**, configures it
and starts it locally with Docker. You need the [requirements](../installation/)
installed and Docker running.

## 1. Generate the project

```sh
npx @lakbast/create-my-saas@latest my-saas --backend nestjs --frontend nextjs
cd my-saas
```

The CLI creates `backend/`, `frontend/` and `deployment/`, plus
`.create-my-saas.json`, which records the chosen templates and versions. It
never overwrites an existing directory.

## 2. Create the local configuration

```sh
npx @lakbast/create-my-saas@latest setup
```

`setup` creates `backend/.env`, `frontend/.env` and `deployment/.env` with a
random development `SECRET_KEY` and the correct local URLs. If any of those
files already exists, it is kept. They are in `.gitignore`: do not commit them
to the repository.

## 3. Start PostgreSQL and Redis

```sh
cd deployment
docker compose -f compose.yaml -f compose.dev.yaml --env-file .env up -d postgres redis
cd ..
```

Check that everything is in place:

```sh
npx @lakbast/create-my-saas@latest doctor
```

`doctor` checks the configuration and that the PostgreSQL and Redis ports
respond.

## 4. Apply the migrations and start the application

```sh
cd deployment
docker compose -f compose.yaml -f compose.dev.yaml --env-file .env --profile migrate run --rm migrate
docker compose -f compose.yaml -f compose.dev.yaml --env-file .env up --build api frontend
```

Open [http://localhost:3000](http://localhost:3000). You can now sign up,
create an organization and invite other users.

> **Note.** In development, transactional emails are skipped if you do not
> configure a delivery adapter. Configure it in `backend/.env` to test email
> verification and password recovery.

## 5. Load demo data (optional)

With the API running, from another terminal at the project root:

```sh
npx @lakbast/create-my-saas@latest seed
```

It creates `demo-owner@example.com` and `demo-member@example.com` and a
`Demo Workspace` team. The password is saved to `.env.demo`, also excluded
from git.

## What's next

- Try other combinations: [available templates](../../guides/templates/).
- Choose between an [individual, teams or mixed](../../reference/product-models/) product.
- Prepare the [production deployment](../../reference/deployment/).
- Keep the project up to date with [`upgrade`](../../reference/upgrading/).
