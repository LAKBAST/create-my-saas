# Changelog

Todos los cambios relevantes de `@soymanolo/create-my-saas` se documentan en
este archivo. El proyecto sigue [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Los webhooks de Stripe de FastAPI leen `metadata` con `to_dict()`: con la
  versión de `stripe` fijada en `uv.lock` es un `StripeObject` sin `.get`, y
  `checkout.session.completed` y `customer.subscription.*` respondían 500.

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

[Unreleased]: https://github.com/SoyManoolo/create-my-saas/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/SoyManoolo/create-my-saas/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/SoyManoolo/create-my-saas/compare/v1.0.0...v1.2.0
[1.0.0]: https://github.com/SoyManoolo/create-my-saas/compare/v0.1.0...v1.0.0
