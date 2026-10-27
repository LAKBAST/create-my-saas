# Astro public-site starter

Plantilla Astro para la parte pública y el área protegida ligera de un SaaS: landing, pricing, documentación, blog, metadatos SEO, `robots.txt`, sitemap y autenticación real de navegador.

## Capacidades y compatibilidad

Implementa las capacidades declaradas en `template.manifest.json`: contenido
público, SEO, analítica con consentimiento y autenticación de navegador con
OAuth. Es compatible con Fastify, FastAPI y NestJS para el área ligera. La
feature `billing` añade organizaciones y Stripe, y requiere FastAPI o NestJS.

## Requisitos

- Node.js 20.9 o posterior y pnpm 11.
- `PUBLIC_SITE_URL` y un backend compatible con el contrato de autenticación.

## Desarrollo local

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm dev
```

## Configuración

`PUBLIC_SITE_URL` es obligatoria y define las URLs canónicas, `robots.txt` y el
sitemap. El generador rellena `API_PROXY_TARGET` para reenviar `/auth` y
`/users` durante desarrollo. En producción, `PUBLIC_API_BASE_URL` debe ser una
ruta del mismo origen que conserve el alcance de las cookies `HttpOnly` y CSRF.

## Qué incluye

- Mismo diseño que las plantillas Next.js y React Router: tokens claro/oscuro en `src/styles/global.css`, nombre del producto en `src/lib/brand.ts` y barra lateral del área protegida en `src/lib/navigation.ts`.

- Páginas públicas de inicio, pricing, documentación y blog, sin precios ni métricas inventadas.
- Etiquetas `description`, canonical, Open Graph y Twitter Card por página.
- Las rutas de autenticación y las áreas protegidas incluyen `noindex, nofollow, noarchive` y se excluyen del sitemap.
- `@astrojs/sitemap` y una ruta `robots.txt`.
- Registro, login, sesión con refresh cookie `HttpOnly`, rutas protegidas, logout, recuperación, verificación de correo y OAuth Google/GitHub.

## Límites deliberados

## Modelo de producto

Tras restaurar la sesión, Astro llama a `POST /workspaces/bootstrap` usando el
token y CSRF de esa sesión, sin renovar otra vez la cookie. El backend decide
`PRODUCT_MODEL`: `individual`, `teams` o `mixed`. Astro ligero también inicializa
el espacio personal cuando corresponde; con Fastify no se añaden organizaciones
ni facturación que ese backend no ofrece.

Con la extensión `billing`, el modo individual abre la suscripción personal sin
pedir una organización. El mixto permite seleccionar Personal o un equipo y
añadir equipos nuevos. Cada espacio tiene su propia suscripción y cambiar de
selección no transfiere el plan. El modo equipos conserva el flujo anterior.
Los backends anteriores sin el endpoint siguen usando su contrato de equipos.

Las pruebas opcionales se ejecutan desde la raíz con
`node node_modules/@playwright/test/cli.js test --config templates/frontend/astro-starter/playwright.workspaces.config.mjs`.
Para probar un proyecto generado con billing, configura
`ASTRO_WORKSPACE_TEST_ROOT` con su carpeta de frontend y
`WORKSPACE_TEST_BILLING=true`. Un proyecto independiente necesita instalar
`@playwright/test` para ejecutar esta suite. Las respuestas controladas prueban
la interfaz; la suite también comprueba el proxy HTTP real de inicialización.

## Límites deliberados

Requiere un backend que implemente el contrato común de autenticación, CSRF y OAuth PKCE. Fastify, FastAPI y NestJS cumplen ese contrato. Configura las credenciales y URLs de callback de Google/GitHub en ese backend; el navegador nunca recibe secretos OAuth ni el refresh token.

Para añadir organizaciones y Stripe Billing, genera Astro con `--feature billing`. Esa característica sólo es compatible con FastAPI y NestJS; sustituye esta versión ligera por las rutas y proxies de facturación.

## Administración global

`/admin/` permite consultar los datos globales del SaaS con FastAPI, NestJS y
Fastify. Requiere una cuenta activa, verificada y con una concesión global
persistida mediante el comando de operador del backend. Los roles de organización
no conceden acceso global. El enlace sólo se muestra después de comprobar ese
permiso; los listados y estadísticas se solicitan con la sesión existente, sin
iniciar un segundo refresh ni guardar tokens en almacenamiento del navegador.

FastAPI y NestJS ofrecen usuarios, organizaciones y suscripciones; Fastify ofrece
usuarios. Las secciones dependen de los recursos declarados por `/admin/access`;
no se presentan ceros para capacidades inexistentes. Funciona también con el
overlay opcional de facturación. Sin backend, la página explica que no está
disponible. Las altas por periodo no equivalen a actividad del usuario y los
recuentos de suscripciones no equivalen a ingresos cobrados.

Con `PUBLIC_API_BASE_URL` las consultas van a `/admin/*` del backend. Cuando se
usa el mismo origen, `/api/admin/*` se reescribe a `/admin/*` mediante el proxy de
desarrollo o el gateway generado. Un hosting estático propio debe configurar esa
regla si no se utiliza una URL de API explícita. El panel se excluye del sitemap
y se sirve con `noindex`; la autorización efectiva siempre la aplica el backend.

## Analítica de producto

PostHog está incluido pero permanece inactivo hasta configurar `PUBLIC_POSTHOG_KEY` y `PUBLIC_POSTHOG_HOST` con la clave pública y el endpoint de ingestión del proyecto. La primera visita muestra un consentimiento explícito; hasta aceptarlo no se inicializa la captura. La integración desactiva autocapture y session replay, registra páginas y `signup_requested`, e identifica al usuario con su ID interno estable, nunca con su email o nombre. Al cerrar sesión restablece esa identidad. Para añadir eventos de producto usa `captureAnalyticsEvent` desde `src/scripts/posthog.ts`; los pagos y otros eventos críticos deben enviarse después desde el backend.

## Verificación

```bash
pnpm check
pnpm build
```

Desde la raíz del repositorio se puede ejecutar la suite de administración con
la dependencia Playwright de desarrollo ya instalada:

```sh
node node_modules/@playwright/test/cli.js test --config templates/frontend/astro-starter/playwright.admin.config.mjs
```

Comprueba permisos, búsqueda, paginación, revocación, recursos de Fastify,
ausencia de backend, escape de contenido, disposición móvil y el proxy real con
un servidor de prueba local. No necesita PostgreSQL; las respuestas de datos se
simulan. Un proyecto generado puede instalar `@playwright/test` para ejecutar
esta suite opcional desde su frontend con `npx playwright test --config
playwright.admin.config.mjs`.

### Enlaces del aviso de analítica

Configura `PUBLIC_PRIVACY_POLICY_URL` y `PUBLIC_COOKIE_POLICY_URL` con las URLs
HTTPS o rutas del mismo sitio de tus políticas publicadas. El aviso muestra los
enlaces configurados; los valores vacíos no generan enlaces a páginas
inexistentes. El texto del aviso usa `PRODUCT_NAME` de `src/lib/brand.ts`.
