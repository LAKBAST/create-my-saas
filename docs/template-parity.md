# Equivalencia de plantillas

FastAPI define el contrato HTTP de referencia. Las diferencias de alcance
declaradas en los manifiestos siguen siendo intencionadas.

## Administración global

Los tres backends ofrecen `admin.platform.read`: concesiones globales separadas de los roles
de organización y endpoints de consulta `/admin/*`. Los tres frontends ofrecen la interfaz
`admin.platform.ui` en `/admin`, con proxy `/api/admin/*` hacia el backend. El
acceso requiere cuenta activa, correo verificado y concesión persistida.

Esta capacidad no cambia las combinaciones compatibles. El endpoint de acceso
declara los recursos: FastAPI y NestJS incluyen usuarios, organizaciones y
suscripciones; Fastify incluye usuarios. Astro funciona con y sin billing.
El resumen representa datos actuales y
altas por periodo, sin atribuirles métricas de actividad o ingresos.
Consulta [la guía de administración](./admin-dashboard.md).

## Contrato de NestJS

Las organizaciones conservan `createdById` (`created_by_id` en PostgreSQL),
como el dato de creador de FastAPI. Se asigna al crear un equipo o espacio
personal y no cambia al transferir la propiedad. La migración
`1773140400000-add-organization-creator.ts` añade una clave foránea a `users`,
rellena con la membresía `owner` más antigua (desempate por id) y aplica
`NOT NULL` solo si no quedan casos sin propietario. Si existen, registra su
recuento y deja `NULL`, sin inventar usuarios; el operador debe revisar esos
casos antes de imponer la restricción. El modelo admite esos valores históricos
desconocidos y las nuevas creaciones siempre guardan al actor real.

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
| Crear organización desde Facturación (`teams` o `mixed`) | Sí | Sí | Fuera de alcance | Sí |
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
El nombre del producto se utiliza en los avisos de consentimiento; los enlaces
de privacidad y cookies dependen de las URL configuradas en cada frontend.

React Router conserva la redirección tras registrarse a `/login?registered=1`,
que comprueba la prueba de navegador. Astro conserva sus atributos `data-*`
de estado y los enlaces y el comportamiento para tokens ausentes utilizados por
esa prueba. Las etiquetas de suscripción ya presentes en Next.js y React Router
se mantienen; los códigos desconocidos siguen siendo visibles como alternativa.

## Extensiones Pro (referencia externa)

Las afirmaciones de este apartado se conservan como referencia histórica de Pro.
Sus overlays no están incluidos en este repositorio Community y deben verificarse
en el repositorio Pro antes de aplicarlas a una versión actual.

Las copias de `app.module.ts` de `api-keys` y `background-jobs` aplican las
mismas reglas de producción. Conservan la validación inline para admitir también
Community 1.4.0, que aún no contiene `src/config.ts`.

La copia de `database/data-source.ts` de `api-keys` registra la migración de
plazas una sola vez. Su definición inline usa el mismo nombre y SQL, por el
mismo motivo de compatibilidad. No se encontraron llamadas consumidoras a
`DELETE /users/me` ni a `/organizations/:id/billing/*` en las extensiones.

## Comprobaciones reproducibles

Instala las dependencias del starter antes de ejecutar sus comandos. Las filas
siguientes indican el directorio de trabajo dentro del repositorio; no son un
registro de resultados de una ejecución concreta.

| Directorio | Comandos |
| --- | --- |
| Raíz | `npm run validate:templates` y `npm test` |
| `templates/backend/fastapi-starter` | `uv sync --locked` y `uv run python -m unittest discover -s tests` |
| `templates/backend/nestjs-starter` | `pnpm build`, `pnpm test --runInBand` y `pnpm run test:e2e --runInBand` |
| `templates/backend/fastify-starter` | `pnpm run typecheck` y `pnpm test` |
| `templates/frontend/react-router-starter` | `pnpm run typecheck` y `pnpm lint` |
| `templates/frontend/astro-starter` | `pnpm run check` |
| `templates/frontend/nextjs-starter` | `pnpm lint` y `pnpm exec tsc --noEmit` |

Para Astro con facturación, genera un proyecto con
`--frontend astro --backend fastapi --feature billing`, instala sus dependencias y ejecuta
`pnpm run check` en `frontend/`. Las pruebas de integración de bases de datos
y Redis requieren los servicios y las variables que declara cada suite.

Desde la raíz, `npm run test:e2e:contract` ejecuta por defecto FastAPI + Next.js.
Para otra combinación, usa el script directamente; por ejemplo:

```sh
node scripts/e2e-generated-projects.mjs --backend nestjs --frontend astro --feature billing
```

Las nueve combinaciones contempladas por las pruebas son FastAPI y NestJS con
Next.js, React Router, Astro base o Astro con `billing`, más Fastify con Astro
base. No todas tienen flujos de organizaciones o facturación. La selección de
jobs de CI depende de los archivos afectados; comprueba los resultados del PR
para conocer las suites ejecutadas. Consulta también
[el contrato API](./api-contract.md) y
[los manifiestos de plantillas](./template-manifests.md).

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

## Escaparate de planes

FastAPI y NestJS anuncian `billing.plans.public` y sirven `GET /billing/plans` sin sesión. Fastify no ofrece facturación. Next.js y React Router muestran planes en la portada; Astro los muestra en Precios y requiere la característica billing para contratar. La elección conserva el precio hasta facturación, donde el usuario confirma antes de abrir Stripe.
