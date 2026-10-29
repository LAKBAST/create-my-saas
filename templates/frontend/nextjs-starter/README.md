# Next.js SaaS starter

Frontend reutilizable para un SaaS, compatible con los backends que implementen el contrato común del proyecto. Incluye autenticación de navegador basada en refresh cookies `HttpOnly`, protección CSRF, sesión en memoria, rutas protegidas, registro, recuperación de contraseña, verificación de correo, OAuth Google/GitHub y cierre de sesión. No guarda access tokens en `localStorage` ni incorpora identidades de ejemplo.

## Capacidades y compatibilidad

Implementa las capacidades declaradas en `template.manifest.json`: sesión de
navegador, CSRF, recuperación, verificación, OAuth Google/GitHub, analítica con
consentimiento, SEO y Stripe Billing. Requiere un backend con organizaciones y
`billing.stripe`, por lo que es compatible con FastAPI y NestJS.

## Requisitos

- Node.js 20.9 o posterior y pnpm 11.
- Un backend FastAPI o NestJS configurado y accesible desde `API_PROXY_TARGET`.

## Desarrollo local

1. Copia el entorno de ejemplo y apunta el proxy del servidor Next al backend elegido:

```bash
cp .env.example .env.local
# Nest: configura también PORT=3001 en el backend.
```

2. Instala y arranca el frontend:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

## Configuración

`API_PROXY_TARGET` es obligatoria y hace que Next reenvíe `/auth/*`, `/users/*`,
`/organizations/*` y `/billing/*` conservando el mismo origen del navegador.
En producción configura el equivalente en el reverse proxy y usa HTTPS con
`COOKIE_SECURE=true`. Define `NEXT_PUBLIC_SITE_URL` con el dominio canónico.

## Verificación

```bash
pnpm build
```

## SEO

Esta plantilla es una aplicación autenticada, no un sitio de marketing. Por eso todas sus rutas se sirven con `noindex, nofollow` y no genera sitemap: evita indexar pantallas privadas, formularios de acceso y URLs con tokens. El archivo `robots.txt` bloquea además las rutas internas de datos. Expón el contenido público e indexable desde una plantilla de sitio público, como la de Astro.

## Contrato API

El proxy selecciona el backend sin acoplar el navegador a su framework. `NEXT_PUBLIC_API_BASE_URL` se deja vacío con el proxy integrado; sólo configúralo cuando esos endpoints se expongan por el mismo origen. La plantilla consume estas rutas y payloads canónicos:

- `POST /auth/register` — `{ name, email, password }`
- `POST /auth/login` y `POST /auth/refresh` — `{ accessToken, user }`; el refresh token permanece en una cookie `HttpOnly`.
- `POST /auth/logout` — requiere la cabecera `X-CSRF-Token` tomada de la cookie pública configurada con `NEXT_PUBLIC_CSRF_COOKIE_NAME`.
- `GET /users/me` — `Authorization: Bearer <accessToken>`.
- `POST /auth/password/reset/request`, `POST /auth/password/reset/confirm`, `POST /auth/email/verify`, `POST /auth/email/resend`.
- OAuth: Nest expone `GET /auth/oauth/:provider`; FastAPI inicia en `GET /auth/oauth/:provider/start`. Ambos vuelven a `/auth/oauth/callback`, donde el frontend restaura la sesión. Requiere un backend con `oauth.pkce`, Google y GitHub configurados.
- Facturación: `/billing` carga las organizaciones, los planes allowlisted y el estado de suscripción. El Checkout y el portal se crean en el backend y el navegador sólo sigue la URL de Stripe que devuelve la API.

El access token se conserva exclusivamente en memoria durante la pestaña. Al cargar, la aplicación intenta renovar la sesión con la refresh cookie; si falla, redirige al login.

## Administración global

La ruta `/admin` ofrece un resumen global y consultas paginadas de usuarios,
organizaciones y suscripciones. La primera implementación requiere el backend
FastAPI o NestJS con sus migraciones aplicadas y un permiso global concedido mediante
su comando de administración. Los roles `owner` y `admin` de una organización
no conceden acceso global. La cuenta también debe estar habilitada y verificada.

El enlace Administración sólo aparece cuando `GET /admin/access` confirma el
permiso. Los recursos disponibles se obtienen del backend y las secciones no
soportadas se ocultan. Sin el contrato de administración, se oculta el enlace y
la ruta muestra un estado de disponibilidad. Las combinaciones existentes siguen
siendo compatibles.

Con el proxy integrado, el navegador consulta `/api/admin/*`, que Next.js
redirige a `/admin/*` del backend, para evitar un conflicto con la página.
Si configuras `NEXT_PUBLIC_API_BASE_URL`, ese origen o prefijo debe exponer las
rutas `/admin/*` de la API. Las consultas usan la sesión existente y no se
almacenan en caché. El servidor vuelve a comprobar el permiso en cada consulta.

El periodo seleccionable afecta a las altas de usuarios y organizaciones;
los totales y las distribuciones de suscripciones reflejan el estado actual.
Las cuentas habilitadas no representan usuarios activos durante el periodo.
No se calculan ingresos, MRR ni actividad de producto a partir de esos totales.

## Analítica de producto

PostHog está incluido pero permanece inactivo hasta configurar `NEXT_PUBLIC_POSTHOG_KEY` y `NEXT_PUBLIC_POSTHOG_HOST` con la clave pública y el endpoint de ingestión del proyecto. La primera visita muestra un consentimiento explícito; hasta aceptarlo no se inicializa la captura. La integración desactiva autocapture y session replay, registra páginas, `signup_requested` y `user_signed_in`, e identifica al usuario con su ID interno estable, nunca con su email o nombre. Al cerrar sesión restablece esa identidad. Para añadir eventos de producto usa `captureAnalyticsEvent` desde `app/components/posthog-provider.tsx`; los pagos y otros eventos críticos deben enviarse después desde el backend.

## Extenderla

El dashboard es deliberadamente neutral. Añade las entidades, vistas y navegación propias del producto sin modificar el núcleo de autenticación. Declara cualquier capacidad nueva del template en `template.manifest.json` y valida todos los manifests desde la raíz:

```bash
node scripts/validate-template-manifests.mjs
```

## Límites deliberados

## Modelo de producto

El backend decide `PRODUCT_MODEL`: `individual`, `teams` o `mixed`. La interfaz
inicializa la sesión de trabajo con `POST /workspaces/bootstrap`, usando la
autenticación y CSRF existentes. No se configura otro modelo en el frontend.

En modo individual, Facturación abre directamente la suscripción personal y no
pide crear una organización. El modo mixto empieza en Personal y permite crear
y seleccionar equipos: cada espacio conserva su propia suscripción, sin mover
planes al cambiar la selección. El modo de equipos conserva la creación de la
primera organización. Una API anterior sin el endpoint de inicialización sigue
usando el flujo de equipos mediante `/organizations`.

Desde la raíz del repositorio, las pruebas opcionales de navegador se ejecutan
con `node node_modules/@playwright/test/cli.js test --config templates/frontend/nextjs-starter/playwright.workspaces.config.mjs`.
El proyecto generado necesita instalar `@playwright/test` para ejecutar estas
pruebas de forma independiente. Las pruebas usan respuestas controladas y
comprueban también el proxy HTTP real; la autorización se verifica en el backend.

## Límites deliberados

Es un dashboard autenticado y no un sitio público de marketing. No incluye
entidades ni pantallas específicas del producto; añádelas sin cambiar el
contrato de autenticación ni las capacidades declaradas.

### Enlaces del aviso de analítica

Configura `NEXT_PUBLIC_PRIVACY_POLICY_URL` y `NEXT_PUBLIC_COOKIE_POLICY_URL` con las
URLs HTTPS o rutas del mismo sitio de tus políticas publicadas. El aviso muestra
los enlaces configurados; los valores vacíos no generan enlaces a páginas
inexistentes. El texto del aviso usa `PRODUCT_NAME` de `app/lib/brand.ts`.

### Escaparate público

Los planes configurados en el backend se muestran sin iniciar sesión. Al elegir uno se solicita registro o inicio de sesión y se vuelve a facturación con el plan seleccionado; el usuario debe confirmar la compra antes de abrir Stripe. Fastify no ofrece el endpoint y se oculta el escaparate. En Astro la contratación requiere `--feature billing`.
