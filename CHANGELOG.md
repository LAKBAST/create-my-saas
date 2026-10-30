# Changelog

Todos los cambios relevantes de `@soymanolo/create-my-saas` se documentan en
este archivo. El proyecto sigue [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- NestJS conserva el creador de organizaciones y espacios personales en
  `created_by_id`, independientemente de los cambios de propietario. La
  migración rellena organizaciones existentes con su propietario más antiguo;
  si faltan propietarios informa del recuento y conserva la columna nullable.
- FastAPI y NestJS declaran `organizations.creation-provenance` para que las
  extensiones puedan exigir el dato del creador en ambos backends. FastAPI ya
  lo guarda con clave foránea a `users` y restricción `NOT NULL`.

### Fixed

- La portada de Next.js y React Router ya no presenta las organizaciones como
  incluidas en cualquier proyecto: el texto vale para los modelos individual,
  teams y mixed.

## [1.11.0] - 2026-10-29

### Added

- Registro declarativo componible de módulos, entidades, migraciones y acciones de
  auditoría para NestJS (`integrations.nestjs`): varias extensiones se pueden
  instalar juntas sin sustituir `AppModule`, los registros de TypeORM ni el
  servicio de auditoría. La plantilla NestJS pasa a `0.2.1` con la capacidad
  `extensions.nestjs`. Consulta `docs/nestjs-extensions.md`.

## [1.10.0] - 2026-10-29

### Added

- Portada pública en Next.js, escaparate de planes sin sesión y retorno seguro a facturación con confirmación explícita.
- Capacidad pública de planes en FastAPI y NestJS y explicaciones de espacios personales y equipos.

### Changed

- El panel de Next.js se mueve de `/` a `/app`; consulta la guía de actualización.
- Las plantillas FastAPI, NestJS, Next.js y React Router pasan a `0.2.0` y Astro
  a `0.3.0`; Fastify no cambia. En versiones `0.x` el rango `^0.1.0` no acepta
  `0.2.0`, así que las extensiones que declaren `^0.1.0` deben actualizar su
  `supportedStacks` para usarse con esta versión.

## [1.9.0] - 2026-10-29

### Added

- Preset de despliegue para Coolify: los proyectos generados incluyen
  `deployment/compose.coolify.yaml`, un gateway HTTP y una guía para
  aplicaciones Docker Compose desde Git. Valida las variables y los secretos
  obligatorios, usa PostgreSQL y Redis externos con TLS, deja las migraciones
  como trabajo manual y comprueba `/ready` antes de enrutar el frontend. Las
  API, los frontends completos y Astro estático reciben solo los servicios que
  necesitan, y `upgrade` puede incorporar los archivos nuevos sin tocar `.env`
  ni datos.
- Web de documentación en <https://createmysaas.dev> con guía de instalación,
  quick start y las guías de `docs/`, publicada desde el repositorio con
  GitHub Pages.
- Guías nuevas: uso de la CLI, actualización de proyectos, resolución de
  problemas, desarrollo y visión de Community.

### Changed

- El repositorio pasa a la organización LAKBAST
  (`github.com/LAKBAST/create-my-saas`). El paquete de npm mantiene el nombre
  `@soymanolo/create-my-saas` y se publica desde el nuevo repositorio con
  Trusted Publishing.
- El README se reduce a una entrada breve y remite a la documentación web.
- Las guías de `docs/` se revisan y actualizan con el estado actual de las
  plantillas, el contrato API, los manifiestos y el despliegue.

## [1.8.1] - 2026-10-29

### Fixed

- En móvil, las tablas del panel global de administración se desplazan dentro de
  su contenedor en lugar de partir los correos a mitad de palabra (Next.js,
  React Router y Astro).

## [1.8.0] - 2026-10-28

### Added

- Selector `--product-model individual|teams|mixed` para generar SaaS personales,
  de equipos o mixtos, con espacios personales internos y facturación separada.
- Bootstrap autenticado de espacios, aislamiento de los espacios personales y
  adaptación del registro y las interfaces de Next.js, React Router y Astro.
- Panel global de administración en los tres backends y frontends, con permisos
  independientes de los roles de organización y recursos según cada backend.
- Punto de extensión `app/admin/admin-extensions.tsx` en Next.js para que una
  extensión añada sus secciones al panel global de administración.
- Cambio de contraseña en Cuenta para Next.js, React Router y Astro sobre el
  contrato común `POST /auth/password/change`, que Fastify incorpora con límite
  de peticiones y revocación de sesiones.
- `create-my-saas setup` genera los `.env` locales con un secreto aleatorio y
  las URLs del backend elegido, y `create-my-saas doctor` comprueba archivos,
  configuración y, opcionalmente, la conexión TCP con PostgreSQL y Redis.
- `create-my-saas seed` crea cuentas y espacios de demostración en proyectos
  locales de desarrollo, con la contraseña guardada en `.env.demo`.
- Contrato API tipado común (`api-contract.ts`) para Next.js, React Router y
  Astro, con una prueba que mantiene idénticas sus copias.

### Changed

- El manifiesto pasa al esquema 4 para conservar el modelo de producto durante
  `upgrade`; la CLI sigue leyendo los esquemas 2 y 3. FastAPI y NestJS mantienen
  `teams` como comportamiento predeterminado y Fastify usa `individual`.

### Fixed

- El lint de los proyectos generados con React Router ya no falla por una
  importación sin uso en `api.client.ts`.
- Los usuarios de demostración usan correos que FastAPI acepta.

## [1.7.1] - 2026-10-25

### Fixed

- Facturación recuerda la ruta del backend y comparte su detección entre
  peticiones concurrentes, evitando repetir peticiones contra el otro backend.
- Los precios de Stripe se consultan en paralelo y se guardan en caché un día.
- Los botones dentro de estados vacíos conservan el contraste de su texto.

## [1.7.0] - 2026-10-25

### Added

- Los planes de facturación de FastAPI y NestJS incluyen el precio real de Stripe,
  con caché de diez minutos y `price: null` si el proveedor no está disponible.
  Next.js, React Router y la extensión Astro de facturación muestran el importe
  y el intervalo en español, y admiten nombres legibles mediante `labels` en
  `STRIPE_PRICE_PLANS`, conservando las configuraciones anteriores.

## [1.6.0] - 2026-10-25

### Added

- `create-my-saas upgrade` actualiza un proyecto generado con una fusión a
  tres bandas: regenera la versión de la que viene y la actual, sustituye los
  archivos que no has tocado, fusiona los que sí y marca los conflictos.
  Incluye `--dry-run`, `--from` para proyectos antiguos, `--allow-dirty` y
  respeta las rutas `unmanaged` de `.create-my-saas.json`.
- Los proyectos generados incluyen `.create-my-saas.json` con las opciones de
  generación, las versiones de las extensiones y los hashes de los archivos,
  que usa el comando `upgrade`. El esquema 3 conserva `templates`
  y los metadatos completos de `extensions` del esquema 2, y añade `cliVersion`,
  `features`, `files` y `unmanaged`.

### Fixed

- La generación normaliza los archivos de texto a LF y fija el orden de lectura
  y los permisos, para producir el mismo resultado desde distintos directorios
  y sistemas. Los secretos siguen siendo marcadores que hay que configurar.

## [1.5.2] - 2026-10-25

### Fixed

- El gateway generado sirve desde el frontend las páginas `/billing` y
  `/auth/oauth/callback`, que comparten prefijo con la API. Al recargarlas, o al
  volver de Google o GitHub, devolvían el 404 en JSON de la API.

## [1.5.1] - 2026-10-25

### Changed

- Los proyectos generados ya no quedan declarados como MIT. La CLI no crea
  `LICENSE` en la raíz y guarda el aviso MIT del código de las plantillas en
  `THIRD_PARTY_NOTICES.md`; las plantillas declaran `"license": "UNLICENSED"`
  (`LicenseRef-Proprietary` en FastAPI) hasta que el autor elija su licencia.

### Fixed

- NestJS incluye ya la configuración de ESLint (`eslint.config.mjs`) que su
  script `lint` necesitaba; antes `pnpm lint` fallaba en todos los proyectos
  generados. `lint` ya no modifica archivos (la corrección automática pasa a
  `lint:fix`), se quitan `eslint-plugin-prettier`, `eslint-config-prettier` y
  `@eslint/eslintrc`, que no se usaban, y el CI ejecuta el lint del starter.

## [1.5.0] - 2026-10-25

### Cambios incompatibles (NestJS)

Los proyectos NestJS ya generados que actualicen deben revisar los clientes que
llamen a la API directamente (los frontends incluidos aceptan los dos formatos):

- El usuario se devuelve como en FastAPI: `id`, `email`, `name`,
  `email_verified` e `is_active`. Desaparecen `emailVerified`, `isActive`,
  `avatarUrl`, `createdAt` y `updatedAt`, y `PATCH /users/me` solo acepta
  `name`.
- Los miembros de una organización se identifican por el `id` de la
  membresía (antes, el `userId`); el usuario va en `user_id`.
- Invitar responde 201 con `{ id, accepted }` (antes 204) y aceptar responde
  204 (antes 201).
- `POST /organizations` exige `slug`, con el mismo patrón que FastAPI.
- Los errores de validación responden 422 con el código `HTTP_422` (antes
  400), y los errores de Stripe, 502.
- Login y refresh añaden `access_token`, `token_type` y `expires_in` a la
  respuesta.

### Changed

- NestJS adopta las rutas de facturación y desactivación de FastAPI; mantiene
  las anteriores como alias obsoletos del mismo servicio. Iguala los códigos
  HTTP, los cuerpos públicos de usuario, sesión, organización y miembros,
  los errores y la validación 422. Añade las rutas de recuperación y
  verificación bajo `/users` y el inicio OAuth con redirección 307.
- La suscripción de NestJS incluye `seats`, con una migración para las
  instalaciones existentes y actualización de plazas desde Stripe. Los
  errores del proveedor de facturación responden 502.

- FastAPI envía los correos de verificación, recuperación de contraseña e
  invitación en HTML con el nombre del producto (`PRODUCT_NAME`), un botón y
  el enlace de respaldo, además de la versión en texto plano. Los asuntos
  pasan a español.

- El diseño y los textos de los correos viven en un único sitio,
  `templates/shared/email` (`layout.html` y `email.json`), que
  `scripts/sync-shared-email.mjs` copia en cada backend; un test de la CLI
  avisa si una copia queda desfasada. Los tres backends los usan: NestJS y
  Fastify comparten `src/email/email-templates.ts` y copian `email/` en su
  imagen Docker. Los correos de NestJS y Fastify pasan a HTML y a español.

### Added

- Astro con facturación permite crear la primera organización desde el estado
  vacío y reintenta con otro slug si el identificador ya está ocupado.
- Los avisos de consentimiento de los tres frontends admiten enlaces
  configurables de privacidad y cookies, documentados en sus `.env.example`.
- La revisión de equivalencia, las excepciones intencionadas y las
  comprobaciones se documentan en `docs/template-parity.md`. Las pruebas de
  navegador crean la primera organización desde la interfaz y comprueban
  el contrato común de invitaciones, miembros y facturación.

- `PRODUCT_NAME` y `EMAIL_ACCENT_COLOR` en los tres backends para el nombre,
  el color del botón y el logo de los
  correos.

### Fixed

- React Router y Astro igualan los estados de cuenta, la validación de
  contraseñas y los mensajes de registro, recuperación y verificación con
  Next.js. Astro muestra el progreso de inicio y los estados de espera de los
  botones; la extensión de facturación muestra plazas, etiquetas de estado,
  planes disponibles y el estado explícito de facturación sin configurar.
- El aviso de consentimiento utiliza `PRODUCT_NAME` en los tres frontends.
- NestJS y Fastify rechazan en staging y producción los secretos de ejemplo,
  los secretos de menos de 32 caracteres y las conexiones de base de datos a
  `localhost`, con las mismas reglas y mensajes que FastAPI. NestJS concentra
  la validación en `src/config.ts` para comprobarla sin iniciar la aplicación.

## [1.4.0] - 2026-10-25

### Changed

- React Router y Astro adoptan el diseño de Next.js: los mismos tokens de color
  con modo claro y oscuro, iconos SVG, barra lateral con menú móvil y tarjetas
  de inicio de sesión. Ambas añaden la página de Configuración y una portada
  con el mismo estilo; el aviso de analítica usa los tokens.
- El nombre del producto se define en un único sitio: `app/lib/brand.ts` en
  React Router y `src/lib/brand.ts` en Astro (antes «SaaS starter» y
  «LaunchKit» repetidos en títulos, metadatos y cabeceras).
- Astro usa `lang="es"` y textos en español también en las páginas públicas.
- La extensión de facturación de Astro ya no sustituye `BaseLayout.astro`:
  añade su enlace con `src/lib/navigation.ts`, y su página y `auth.ts`
  siguen el nuevo diseño.

### Added

- React Router: ESLint con `typescript-eslint` y `eslint-plugin-react-hooks`,
  y el script `pnpm lint`, como en Next.js.

### Fixed

- React Router: la verificación de correo y el aviso de analítica ya no
  actualizan el estado de forma síncrona dentro de un efecto
  (`react-hooks/set-state-in-effect`); el consentimiento se lee con
  `useSyncExternalStore`, como en Next.js.
- El icono de los pasos completados del inicio se veía gris sobre el círculo
  verde (Next.js, React Router y Astro).
- La extensión de facturación de Astro excluye del sitemap las páginas
  privadas, como la plantilla Astro.
- FastAPI envía los correos con un User-Agent propio: Resend (tras Cloudflare)
  rechazaba el de urllib con un 403 y el registro fallaba.
- FastAPI: si el correo de verificación no se puede enviar al registrarse,
  responde `EMAIL_DELIVERY_UNAVAILABLE` (503) en lugar de un error 500.

## [1.3.3] - 2026-10-25

### Fixed

- La extensión de facturación de Astro muestra los botones de Google y GitHub
  cuando el proveedor está configurado, comparte el refresco de sesión entre
  pestañas y renueva el token antes de que caduque, como la plantilla Astro.

## [1.3.2] - 2026-10-24

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

[Unreleased]: https://github.com/LAKBAST/create-my-saas/compare/v1.11.0...HEAD
[1.11.0]: https://github.com/LAKBAST/create-my-saas/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/LAKBAST/create-my-saas/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/LAKBAST/create-my-saas/compare/v1.8.1...v1.9.0
[1.8.1]: https://github.com/LAKBAST/create-my-saas/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/LAKBAST/create-my-saas/compare/v1.7.1...v1.8.0
[1.7.1]: https://github.com/LAKBAST/create-my-saas/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/LAKBAST/create-my-saas/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/LAKBAST/create-my-saas/compare/v1.5.2...v1.6.0
[1.5.2]: https://github.com/LAKBAST/create-my-saas/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/LAKBAST/create-my-saas/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/LAKBAST/create-my-saas/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/LAKBAST/create-my-saas/compare/v1.3.3...v1.4.0
[1.3.3]: https://github.com/LAKBAST/create-my-saas/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/LAKBAST/create-my-saas/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/LAKBAST/create-my-saas/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/LAKBAST/create-my-saas/compare/v1.2.2...v1.3.0
[1.2.2]: https://github.com/LAKBAST/create-my-saas/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/LAKBAST/create-my-saas/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/LAKBAST/create-my-saas/compare/v1.0.0...v1.2.0
[1.0.0]: https://github.com/LAKBAST/create-my-saas/compare/v0.1.0...v1.0.0
