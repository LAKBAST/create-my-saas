# Administración global del SaaS

El panel está disponible en **Next.js, React Router y Astro**, con los backends
compatibles de cada plantilla. Permite consultar usuarios y, cuando el backend
los ofrece, organizaciones y suscripciones de una
instancia del producto generado. Cada despliegue conserva sus propios datos y
administradores; el panel no conecta aplicaciones generadas diferentes.

## Acceso

Los roles `owner` y `admin` de una organización no dan acceso global. El panel
requiere una cuenta activa, con correo verificado, y una concesión persistida de
administración global. No se conceden permisos al primer registro ni por un
correo configurado en el frontend. El registro y la edición de perfil no
permiten modificar estas concesiones.

Aplica las migraciones del backend antes de usar el panel. Concede o revoca el
permiso desde la carpeta del backend, con las variables de conexión a PostgreSQL
disponibles en el entorno del proceso:

NestJS:

```sh
pnpm migration:run
pnpm build
node dist/admin/manage-admin.js grant <user-uuid>
# Para revocar:
node dist/admin/manage-admin.js revoke <user-uuid>
```

FastAPI: aplica `uv run alembic upgrade heads` y ejecuta
`uv run python -m src.modules.admin.manage grant <user-uuid>` o
`uv run python -m src.modules.admin.manage revoke <user-uuid>`.
Fastify: aplica `pnpm db:migrate`, compila con `pnpm build` y ejecuta
`node dist/admin/manage-admin.js grant <user-uuid>` o `revoke <user-uuid>`.

Utiliza el UUID de una cuenta registrada cuyo correo ya esté verificado.
Sin concesiones, el panel permanece deshabilitado para todas las cuentas.
Las consultas comprueban el permiso en cada petición, por lo que una
revocación no necesita esperar a la caducidad del token de acceso.

Después de iniciar sesión como administrador, la navegación muestra
Administración y permite entrar en `/admin` (`/admin/` en Astro). Los proxies
de Next.js y React Router reenvían las consultas
`/api/admin/*` a `/admin/*` del backend con `API_PROXY_TARGET`. Este prefijo evita
confundir la página del frontend con los endpoints del backend. El gateway
generado sirve `/admin` desde el frontend y reenvía `/api/admin/*` directamente
a `/admin/*` de la API.

FastAPI y NestJS declaran los recursos `users`,
`organizations` y `subscriptions`; Fastify declara sólo `users`. El panel oculta
los recursos no disponibles, cuyos totales son `null`, sin inventar ceros.
Astro usa `PUBLIC_API_BASE_URL` cuando está configurada y el alias `/api/admin/*`
en el mismo origen en caso contrario, tanto con billing como sin esa extensión.
Un frontend generado sin backend no tiene datos administrativos que consultar.

## Secciones de extensiones (Next.js)

`app/admin/admin-extensions.tsx` es el punto de extensión del panel en Next.js.
Community exporta `AdminExtensionNavigation`, que no muestra nada, y la página lo
renderiza bajo la cabecera. Una extensión que añade sus propias secciones de
administración declara ese archivo en el `replace` de su target
`frontend:nextjs` y devuelve los enlaces a sus páginas. Las páginas de la
extensión deben comprobar los permisos en el backend; el enlace no concede acceso.

## Consultas y estadísticas

| Vista | Datos |
| --- | --- |
| Resumen | Totales de usuarios, cuentas habilitadas, correos verificados, organizaciones y suscripciones; altas durante el periodo seleccionado |
| Distribución | Número de suscripciones por plan y por estado |
| Usuarios | Nombre, correo, estado, verificación y fecha de alta |
| Organizaciones | Nombre, slug, fecha de creación y número de miembros |
| Suscripciones | Organización, proveedor, plan, estado, plazas, periodo y cancelación programada |

Las listas tienen búsqueda en servidor y paginación limitada. Las respuestas
exponen campos explícitos y llevan `Cache-Control: private, no-store`. Los datos de
autenticación y los identificadores privados del proveedor de pagos no forman
parte del contrato.

El periodo del resumen mide nuevas altas, no actividad del usuario. Una cuenta
habilitada no equivale a un usuario activo durante ese periodo. La distribución
de suscripciones representa el estado actual y no una serie histórica.

No se calculan MRR, ingresos cobrados, churn ni actividad de producto: requieren
fuentes y definiciones adicionales. PostHog sigue siendo una integración
opcional independiente. El panel tampoco permite suspender usuarios, eliminar
datos, modificar suscripciones o suplantar sesiones.

## Contrato HTTP

Todas las rutas requieren una sesión válida mediante `Authorization: Bearer`.

- `GET /admin/access`: devuelve `{ allowed: boolean, resources: string[] }` para descubrir el acceso y los recursos disponibles.
- `GET /admin/overview?days=30`: resumen, con un periodo de 1 a 365 días.
- `GET /admin/users?page=1&pageSize=25&search=...`.
- `GET /admin/organizations?page=1&pageSize=25&search=...` (FastAPI y NestJS).
- `GET /admin/subscriptions?page=1&pageSize=25&search=...` (FastAPI y NestJS).

Las listas devuelven `{ items, total, page, pageSize }`, con un máximo de 100
elementos por página. Sin permiso global, las consultas de datos responden
`403 PLATFORM_ADMIN_REQUIRED`. Una sesión ausente o inválida no permite consultar
datos aunque se acceda directamente a la API.

## Comprobaciones

Desde la raíz, `npm run test:e2e:admin` ejecuta las pruebas de navegador de
Next.js. React Router y Astro incluyen sus propias suites en `test/` y
`playwright.admin.config.mjs`. Tras instalar las dependencias del frontend y
Playwright con Chromium, ejecuta desde la raíz del repositorio:

```sh
npx playwright test --config templates/frontend/react-router-starter/playwright.admin.config.mjs
```

Para Astro, entra en `templates/frontend/astro-starter` y ejecuta
`npx playwright test --config playwright.admin.config.mjs`.
Las suites usan respuestas simuladas para verificar estados y permisos de interfaz y una
API local de prueba para comprobar los proxies reales.

Estas pruebas no sustituyen la comprobación del backend: los tests de FastAPI,
NestJS y Fastify cubren autorización, consultas y concesiones globales. Consulta
los comandos de cada starter y comprueba las migraciones en PostgreSQL antes de
activar el panel en un despliegue real. Consulta también
[la guía de despliegue](./deployment.md).
