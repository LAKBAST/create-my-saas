---
title: Plantillas
description: Backends y frontends disponibles y qué combinaciones admite la CLI.
---

Cada proyecto se compone de un backend, un frontend o ambos. Puedes ver el
catálogo exacto de tu versión con `--list`.

## Backends

| ID | Stack | Qué incluye |
| --- | --- | --- |
| `fastapi` | Python | Sesiones de navegador, CSRF, usuarios, organizaciones, RBAC, audit log, recuperación y verificación, OAuth y billing. |
| `nestjs` | TypeScript | API modular con el mismo contrato funcional que FastAPI. |
| `fastify` | TypeScript | API ligera con PostgreSQL, sesiones, CSRF, recuperación, verificación de email y OAuth de Google y GitHub. Sin organizaciones ni Stripe Billing por ahora. |

## Frontends

| ID | Stack | Qué incluye |
| --- | --- | --- |
| `nextjs` | Next.js | Dashboard con sesión de navegador, rutas protegidas y flujos de cuenta. |
| `react-router` | React Router (Framework Mode) | Dashboard React con renderizado en servidor, rutas protegidas y proxy de API same-origin. |
| `astro` | Astro | Sitio de marketing, documentación y blog con una zona autenticada ligera. Billing opcional. |

## Compatibilidad

La CLI compara las capacidades declaradas en cada `template.manifest.json`
antes de escribir archivos:

- Los dashboards **Next.js** y **React Router** necesitan organizaciones y
  Stripe Billing, así que requieren **FastAPI** o **NestJS**.
- **Astro** funciona con los tres backends. Para añadirle billing usa
  `--feature billing`, disponible con FastAPI y NestJS.
- **Fastify** puede generarse solo o con Astro y solo admite el modelo de
  producto `individual`.

## Ejemplos

```sh
# Stack completo
npx @soymanolo/create-my-saas@latest my-saas --backend fastapi --frontend react-router

# Sitio Astro con facturación
npx @soymanolo/create-my-saas@latest my-saas --backend nestjs --frontend astro --feature billing

# Solo la API
npx @soymanolo/create-my-saas@latest api-only --backend fastapi

# Solo el sitio público
npx @soymanolo/create-my-saas@latest public-site --frontend astro
```

Para el detalle de qué cubre cada plantilla, consulta la
[equivalencia de plantillas](../../referencia/template-parity/).
