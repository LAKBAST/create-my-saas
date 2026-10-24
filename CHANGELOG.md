# Changelog

Todos los cambios relevantes de `@soymanolo/create-my-saas` se documentan en
este archivo. El proyecto sigue [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- FastAPI: `GET /auth/oauth/providers`, como ya tenían NestJS y Fastify.
- `EMAIL_FROM` en los tres backends: remitente para proveedores que lo exigen,
  como Resend.
- React Router: formulario para crear la organización en Facturación, como en
  Next.js, y etiquetas legibles para el estado de la suscripción.

### Fixed

- Los botones de Google y GitHub solo aparecen si el proveedor está configurado
  en el backend (Next.js, React Router y Astro); antes llevaban a un error JSON.
- React Router y Astro comparten un único refresco de sesión por pestaña y lo
  serializan entre pestañas con Web Locks, y renuevan el token de acceso antes
  de que caduque. En React Router, volver de OAuth lanzaba dos refrescos a la
  vez y la detección de reutilización cerraba todas las sesiones.
- React Router: la página de Facturación espera a que se restaure la sesión;
  al recargarla mostraba «La sesión ha caducado».
- Crear una organización reintenta con sufijo también con el código
  `ORGANIZATION_SLUG_ALREADY_EXISTS` de NestJS.
- Fastify revoca todas las sesiones del usuario al reutilizarse un refresh
  token, igual que FastAPI y NestJS.
- El gateway generado enruta a la API los prefijos que ofrece el backend
  (`/billing`, `/organizations`) aunque el frontend no los use; con Astro, los
  webhooks de Stripe acababan en el frontend.
- Next.js usa `PRODUCT_NAME` en los metadatos del layout.

## [1.3.1] - 2026-10-24

### Added

- Next.js: formulario para crear la organización en Facturación cuando el
  usuario no tiene ninguna; antes un cliente nuevo no podía contratar un plan.

### Fixed

- Next.js renueva el token de acceso un minuto antes de que caduque (y al
  volver a una pestaña en segundo plano); antes la app fallaba con «sesión
  caducada» a los 15 minutos hasta recargar.
- Varias pestañas ya no cierran la sesión al refrescar a la vez: los refrescos
  se serializan con Web Locks para no reutilizar un refresh token rotado.

## [1.3.0] - 2026-10-24

### Changed

- Nuevo diseño del frontend Next.js: tokens de color y tipografía en
  `globals.css` (modo claro y oscuro según el sistema), clases comunes
  (`btn`, `badge`, `field`, `notice`), iconos SVG, barra lateral con miga de
  pan y menú móvil, y páginas de inicio (primeros pasos), cuenta, facturación,
  configuración y acceso rediseñadas. El nombre del producto se cambia en
  `app/lib/brand.ts`.

### Fixed

- Next.js ya no cierra la sesión al recargar: los refrescos simultáneos de la
  sesión (Strict Mode, varios componentes) comparten una sola petición, en vez
  de reutilizar un refresh token ya rotado, que el backend trata como robo y
  revoca todas las sesiones.
- La página de facturación de Next.js carga sus datos solo cuando la sesión
  está restaurada; al recargarla mostraba «La sesión ha caducado».

## [1.2.2] - 2026-10-24

### Fixed

- Los webhooks de Stripe de FastAPI leen `metadata` con `to_dict()`: con la
  versión de `stripe` fijada en `uv.lock` es un `StripeObject` sin `.get`, y
  `checkout.session.completed` y `customer.subscription.*` respondían 500.
- `pnpm lint` pasa en un frontend Next.js recién generado: la página de
  facturación y el proveedor de PostHog ya no llaman a `setState` de forma
  síncrona dentro de un efecto (`react-hooks/set-state-in-effect`).
- Los proyectos generados incluyen un `.gitignore` en la raíz según las capas
  seleccionadas (`.env`, `.venv`, `node_modules`, `.next`, certificados TLS de
  `deployment/`…). npm nunca publica los `.gitignore` de los templates, así
  que hasta ahora no había ninguno; la CLI tampoco los copia ya desde el
  repositorio para que ambos casos generen lo mismo.

## [1.2.1] - 2026-10-23

### Fixed

- El servicio `migrate` de FastAPI ejecuta `alembic upgrade heads`, de modo que
  un proyecto con varias extensiones que añaden migraciones en ramas propias
  de Alembic se migra completo en vez de fallar por tener varias heads.
- Cuando una extensión de FastAPI declara configuración obligatoria, el
  proyecto generado incluye `tests/test_extension_settings.py`, que da valores
  sólo de prueba a esa configuración durante `unittest discover`. Así la suite
  del template ya no falla por la configuración de las extensiones; la API
  sigue sin arrancar fuera de los tests si falta. Al ejecutar un único módulo
  de tests hay que definir esas variables.

## [1.2.0] - 2026-10-23

Primera versión de npm posterior a `1.0.0`. El tag `v1.1.0` se creó, pero su
publicación en npm falló; sus mejoras se incluyen en esta versión.

### Added

- Las extensiones externas pueden usar un namespace de autor estable y se
  descubren desde directorios locales con `--extensions-dir`.
- Las extensiones de FastAPI pueden componer routers, configuración validada y
  acciones de auditoría mediante integraciones declarativas. Las extensiones de
  Next.js pueden declarar sus rutas generadas.
- La CLI resuelve automáticamente las dependencias disponibles de una
  extensión y las instala en orden de dependencia.

### Changed

- Las notas de cada GitHub Release se generan a partir de su sección del
  changelog.

### Fixed

- Corregido el workflow de releases para validar correctamente la versión del
  tag antes de publicar.
- La selección explícita de una dependencia ya resuelta es idempotente.
- La validación de extensiones usa la versión real de la CLI, y se rechazan
  enlaces simbólicos en la raíz o un ancestro de overlays externos.
- Los proyectos generados con solo backend publican el puerto de la API;
  React Router configura `API_PROXY_TARGET` en su contenedor.
- Los retornos de Stripe llegan a la página de facturación existente en Next.js
  y React Router.
- Los webhooks antiguos no restauran suscripciones previas y los errores por
  otras restricciones no se confirman como duplicados. Se admite una nueva
  suscripción después de cancelar la anterior.
- Las invitaciones pueden recuperarse si falla el envío del correo.
- La guía y el Compose generados para Astro sin backend funcionan sin servicios
  ni volúmenes de base de datos.

## [1.0.0] - 2026-09-20

Primera versión estable pública de Community.

### Added

- CLI pública bajo el scope `@soymanolo/create-my-saas`, con catálogo de
  plantillas versionadas y generación atómica de proyectos.
- Starters para FastAPI, NestJS, Fastify, Next.js, React Router y Astro, con
  compatibilidad validada por capacidades.
- Autenticación, recuperación de cuenta, OAuth de Google y GitHub,
  organizaciones, roles, invitaciones, auditoría y Stripe Billing en los
  stacks que lo soportan.
- Rate limiting distribuido con Redis, comprobaciones de disponibilidad y
  contratos de seguridad para los backends.
- Host de extensiones Community y extensión opcional de facturación para
  Astro.
- Despliegue reproducible con Docker Compose, PostgreSQL, Redis, migraciones
  separadas y gateway TLS.
- Soporte para que las extensiones declaren secretos de despliegue y se
  incorporen a `deployment/.env.production.example`.

### Security

- Auditoría pública automatizada para detectar secretos, archivos generados,
  dependencias privadas y referencias internas antes de publicar.
- Endurecimiento de sesiones, límites de autenticación, gestión de OAuth y
  acciones sensibles de organizaciones.

### Changed

- El paquete se distribuye con el scope `@soymanolo` para asegurar identidad y
  propiedad en npm.
- La licencia de Community es MIT.

### Verification

- Validación de manifiestos y pruebas de generación para las combinaciones de
  plantillas y extensiones compatibles.

[Unreleased]: https://github.com/SoyManoolo/create-my-saas/compare/v1.3.1...HEAD
[1.3.1]: https://github.com/SoyManoolo/create-my-saas/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/SoyManoolo/create-my-saas/compare/v1.2.2...v1.3.0
[1.2.2]: https://github.com/SoyManoolo/create-my-saas/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/SoyManoolo/create-my-saas/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/SoyManoolo/create-my-saas/compare/v1.0.0...v1.2.0
[1.0.0]: https://github.com/SoyManoolo/create-my-saas/compare/v0.1.0...v1.0.0
