# Equivalencia de plantillas

FastAPI define el contrato HTTP de referencia. Las diferencias de alcance
declaradas en los manifiestos siguen siendo intencionadas.

## Contrato de NestJS

| Operación | Contrato compartido |
| --- | --- |
| Crear y listar organizaciones | 201 y 200; objetos con `id`, `name`, `slug` |
| Slug ocupado | 409, `SLUG_ALREADY_EXISTS` |
| Invitar | 201, `{ id, accepted: false }`, también al reintentar |
| Aceptar invitación | 204, sin cuerpo |
| Listar miembros | `id`, `user_id`, `email`, `name`, `role` |
| Cambiar o eliminar miembro | El identificador de la membresía identifica al destinatario |
| Miembro inexistente | 404, `MEMBERSHIP_NOT_FOUND` |
| Eliminar propietario | 409, `OWNER_REQUIRED` |
| Acceso a organización | 403, `MEMBERSHIP_REQUIRED` o `INSUFFICIENT_ROLE` |
| Desactivar cuenta | `POST /users/me/deactivate`, 204 |
| Cambiar contraseña | `POST /users/me/password`, 204 |
| Solicitar recuperación | `POST /users/password-reset/request`, 202 y `{ accepted: true }` |
| Confirmar recuperación | `POST /users/password-reset/confirm`, 204 |
| Solicitar verificación | `POST /users/email-verification/request`, 202 y `{ accepted: true }` |
| Confirmar verificación | `POST /users/email-verification/confirm`, 200 con usuario público |
| Tokens de recuperación o verificación inválidos | 400, `INVALID_RESET_TOKEN` o `INVALID_VERIFICATION_TOKEN` |
| Usuario público | `id`, `email`, `name`, `email_verified`, `is_active` |
| Sesión | `accessToken`, `access_token`, `token_type`, `expires_in`, `user`; refresh solo en cookie |
| Suscripción | `GET /billing/organizations/:id`; incluye `seats` y evita exponer campos internos |
| Configuración, Checkout y portal | `/billing/organizations/:id/configuration`, `/checkout`, `/portal`; respuestas 200 |
| Inicio OAuth con redirección | `GET /auth/oauth/:provider/start`, 307 |
| Payload inválido | 422, `HTTP_422`, sin reflejar credenciales |
| Error de proveedor de facturación | 502, `BILLING_PROVIDER_ERROR` |

`DELETE /users/me` y `/organizations/:id/billing/*` se conservan como alias
obsoletos del mismo servicio. Las rutas existentes de autenticación bajo
`/auth` y el identificador de usuario antes admitido en las operaciones de
miembros también siguen funcionando. Los clientes conservan sus alternativas
con reintento tras 404. Los webhooks siguen en `/billing/webhooks/stripe`.

Las plazas de la suscripción requieren la migración
`1773140100000-add-subscription-seats.ts`; las suscripciones existentes empiezan
con una plaza y las notificaciones de Stripe actualizan la cantidad.

## Configuración de producción

En `staging` y `production`, NestJS y Fastify exigen un secreto de al menos
32 caracteres y rechazan los mismos valores de ejemplo que FastAPI:

- `development-only-secret-not-for-production-32b`
- `change-me-in-production`
- `replace-with-a-long-random-secret`

Rechazan `DATABASE_URL` que contenga `localhost`. No se añade una prohibición
de `127.0.0.1`: FastAPI actualmente no la tiene. Los requisitos previos de SSL,
cookies, correo y Redis se conservan.

## Revisión de páginas

| Página o estado | Next.js | React Router | Astro base | Astro con facturación |
| --- | --- | --- | --- | --- |
| Inicio privado | `/` | `/app` | `/app/` | `/app/` |
| Cuenta | `/account` | `/account` | `/account/` | `/account/` |
| Configuración | `/settings` | `/settings` | `/settings/` | `/settings/` |
| Acceso y registro | `/login`, `/register` | Las mismas | Las mismas con `/` final | Las mismas con `/` final |
| Recuperación y nueva contraseña | `/forgot-password`, `/reset-password` | Las mismas | Las mismas con `/` final | Las mismas con `/` final |
| Verificación de correo | `/verify-email` | La misma | `/verify-email/` | `/verify-email/` |
| Retorno OAuth | `/auth/oauth/callback` | La misma | La misma con `/` final | La misma con `/` final |
| Facturación | `/billing` | `/billing` | Fuera de alcance | `/billing/` |
| Crear primera organización desde Facturación | Sí | Sí | Fuera de alcance | Sí |
| Portada pública | No, inicio privado | `/` | `/` | `/` |
| Precios, documentación y blog públicos | No | No | `/pricing`, `/docs`, `/blog` | Las mismas |

La portada pública y las páginas de contenido de Astro son capacidades propias
de las plantillas; no son pantallas privadas faltantes en Next.js.

Se igualan la validación de contraseñas, los avisos de recuperación y
verificación, el estado activo de la cuenta y los textos durante las
solicitudes. Astro añade los estados de éxito, el progreso inicial y, con la
extensión, la creación de organización, sus plazas y la presentación explícita
de planes y de facturación sin configurar. El estado de suscripción se presenta
con etiquetas en español en lugar de repetir el código de Stripe en el título.
`PRODUCT_NAME` también se utiliza en los tres avisos de consentimiento.

React Router conserva la redirección tras registrarse a `/login?registered=1`,
que comprueba la prueba de navegador. Astro conserva sus atributos `data-*`
de estado y los enlaces y el comportamiento para tokens ausentes utilizados por
esa prueba. Las etiquetas de suscripción ya presentes en Next.js y React Router
se mantienen; los códigos desconocidos siguen siendo visibles como alternativa.

## Extensiones Pro

Las copias de `app.module.ts` de `api-keys` y `background-jobs` aplican las
mismas reglas de producción. Conservan la validación inline para admitir también
Community 1.4.0, que aún no contiene `src/config.ts`.

La copia de `database/data-source.ts` de `api-keys` registra la migración de
plazas una sola vez. Su definición inline usa el mismo nombre y SQL, por el
mismo motivo de compatibilidad. No se encontraron llamadas consumidoras a
`DELETE /users/me` ni a `/organizations/:id/billing/*` en las extensiones.

## Comprobaciones locales

| Comprobación | Resultado |
| --- | --- |
| FastAPI: `uv run python -m unittest discover -s tests` | 62 correctos, 9 omitidos |
| NestJS: `npx tsc --noEmit -p tsconfig.json` y `pnpm test --runInBand` | Correctos; 51 tests correctos, 1 de Redis omitido |
| NestJS: `pnpm run test:e2e --runInBand` | 18 correctos con SQL.js |
| Fastify: `pnpm run typecheck` y `pnpm test` | Correctos; 23 tests correctos, 1 de Redis omitido |
| React Router: `pnpm run typecheck` y `pnpm lint` | Correctos |
| Astro: `pnpm run check` | 24 archivos, 0 errores, avisos e indicaciones |
| Astro generado con facturación: `pnpm run check` | 25 archivos, 0 errores, avisos e indicaciones |
| Next.js: `pnpm lint` y `npx tsc --noEmit` | Correctos |
| CLI: `node --test --test-concurrency=1` en `packages/cli` | 39 correctos; 2 fallos conocidos `EPERM` al crear enlaces simbólicos en Windows |
| Pro: `npm test` | 11 correctos, 6 omitidos; también con Community 1.4.0 |
| Pro api-keys + NestJS: typecheck y tests | 68 correctos, 1 de Redis omitido |
| Pro background-jobs + NestJS: typecheck y tests | 71 correctos, 15 omitidos |

Los tests de comercio omitidos en Pro requieren `COMMERCE_TEST_DATABASE_URL`;
la integración de despliegue requiere Docker y
`RUN_API_KEYS_DEPLOYMENT_INTEGRATION=1`. Las pruebas omitidas de bases de datos y
Redis requieren sus servicios y variables de integración.

La matriz de CI conserva las nueve combinaciones compatibles de navegador. El
test crea la primera organización desde la interfaz y comprueba invitaciones,
identificadores de miembros, permisos y facturación usando las rutas canónicas.
Su ejecución remota se consulta en el PR; los checks locales no sustituyen ese
resultado.

## Diferencias preservadas

- Fastify continúa como backend ligero, sin organizaciones, invitaciones,
  facturación ni auditoría.
- Astro base no añade organizaciones ni facturación; la extensión las habilita.
- Se conserva el conjunto de roles de NestJS. FastAPI admite además el rol de
  facturación; ampliarlo exigiría cambiar roles, fuera de esta revisión.
- La validación conserva las reglas específicas de cada framework donde no
  afectan al contrato público revisado; no se unifican ORM, cookies internas ni
  la implementación de sesiones.
- No se inventan políticas ni identidad legal. Los avisos pueden enlazar a las
  URLs reales de privacidad y cookies configuradas por cada producto.
