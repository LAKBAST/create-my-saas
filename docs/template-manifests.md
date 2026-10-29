# Manifiestos de plantillas

Cada starter incluye un `template.manifest.json` en su raíz. La CLI descubre
estos archivos en los directorios inmediatamente inferiores a
`templates/backend/` y `templates/frontend/`. El identificador procede del
manifiesto, no del nombre de la carpeta ni del archivo del gestor de paquetes.

El formato JSON permite leer los metadatos sin instalar las dependencias del
starter. El esquema actual es `1`, descrito en
[`template-manifest.schema.json`](./template-manifest.schema.json). Desde la
raíz, ejecuta `npm run validate:templates` para validar plantillas y extensiones.

## Campos

| Campo | Significado |
| --- | --- |
| `schemaVersion` | Versión del formato; actualmente `1`. |
| `id` | Identificador estable `<kind>:<slug>`, por ejemplo `backend:fastapi`. |
| `version` | Versión semántica del contrato del proyecto generado por la plantilla. |
| `kind` | `backend` o `frontend`; coincide con el prefijo de `id`. |
| `displayName`, `description` | Nombre y descripción de la plantilla. |
| `runtime` | `language`, `packageManager` y, opcionalmente, `version`. |
| `capabilities` | Lista única de capacidades implementadas, como `auth.password`. |
| `environment.required` | Variables que la aplicación debe configurar; cada entrada contiene `name`, `secret` y `description`, sin valores ni credenciales. |
| `development` | Puerto y URL local (`port`, `baseUrl`). El esquema lo permite como opcional, pero la CLI exige `baseUrl` para los backends. |
| `compatibility` | Campo opcional con `requiresBackendCapabilities`, usado al combinar frontend y backend. |

`secret` identifica variables sensibles; no configura su valor ni sustituye la
gestión de secretos del despliegue. Las capacidades describen comportamiento
implementado, no planes futuros. Una plantilla que solo tenga modelos de
facturación no debe declarar `billing.stripe` sin la integración correspondiente.

## Catálogo y selección

Los IDs completos se usan en los manifiestos de extensiones. Los flags
`--backend` y `--frontend` aceptan el nombre corto, sin el prefijo:

| Tipo | ID | Selector CLI | Versión de plantilla |
| --- | --- | --- | --- |
| Backend | `backend:fastapi` | `fastapi` | `0.1.0` |
| Backend | `backend:nestjs` | `nestjs` | `0.1.0` |
| Backend | `backend:fastify` | `fastify` | `0.1.0` |
| Frontend | `frontend:nextjs` | `nextjs` | `0.1.0` |
| Frontend | `frontend:react-router` | `react-router` | `0.1.0` |
| Frontend | `frontend:astro` | `astro` | `0.2.0` |

Desde un checkout, consulta el catálogo y la ayuda con:

```sh
node packages/cli/bin/create-my-saas.js --list
node packages/cli/bin/create-my-saas.js --help
node packages/cli/bin/create-my-saas.js mi-saas --backend fastapi --frontend nextjs
```

Las versiones de plantilla son independientes de la versión del paquete CLI.
La generación exige al menos `--backend` o `--frontend` y un destino que no
exista. También admite una sola plantilla; las pantallas que requieren API
necesitan que se configure un backend para funcionar.

## Sesiones de navegador y compatibilidad

Los tres frontends, incluido Astro, declaran `auth.browser-sessions` e incluyen
`API_PROXY_TARGET` en `.env.example`. Al generar frontend y backend juntos,
la CLI sustituye ese valor por `development.baseUrl` del backend cuando el
frontend declara requisitos de capacidades. Next.js y React Router incluyen
proxies de API; Astro incluye un proxy de desarrollo con `API_PROXY_TARGET` y
usa `PUBLIC_API_BASE_URL` o el gateway de mismo origen en producción.

La CLI comprueba `compatibility.requiresBackendCapabilities` antes de escribir
el proyecto. FastAPI y NestJS son compatibles con los tres frontends; Fastify
solo con Astro. Next.js y React Router requieren `organizations` y
`billing.stripe`, que Fastify no implementa. Elegir el modelo `individual` no
elimina estos requisitos. Consulta [los modelos de producto](./product-models.md).

Astro base incluye autenticación, área privada y administración, pero la
interfaz de facturación requiere `--feature billing`. Ese alias corresponde a
`community:astro-billing`, compatible con Astro y FastAPI o NestJS. Consulta
[los manifiestos de extensiones](./extension-manifests.md).

## Añadir una plantilla

1. Añade el starter a `templates/backend/` o `templates/frontend/`.
2. Crea su `template.manifest.json` con ID estable y `kind` correspondiente.
3. Declara únicamente capacidades implementadas y comprobadas; reutiliza los
   nombres existentes cuando signifiquen lo mismo.
4. Declara las variables necesarias en `environment.required` y documenta sus
   valores en `.env.example`, sin credenciales reales.
5. Añade `development` para un backend y los requisitos de compatibilidad para
   un frontend que use API. Ejecuta `npm run validate:templates` y añade pruebas
   de generación y de las combinaciones compatibles.
