# Administración global del SaaS

La primera versión del panel está disponible en la combinación **NestJS +
Next.js**. Permite consultar usuarios, organizaciones y suscripciones de una
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

```sh
pnpm migration:run
pnpm build
node dist/admin/manage-admin.js grant <user-uuid>
# Para revocar:
node dist/admin/manage-admin.js revoke <user-uuid>
```

Utiliza el UUID de una cuenta registrada cuyo correo ya esté verificado.
Sin concesiones, el panel permanece deshabilitado para todas las cuentas.
Las consultas comprueban el permiso en cada petición, por lo que una
revocación no necesita esperar a la caducidad del token de acceso.

Después de iniciar sesión como administrador, la navegación de Next.js muestra
Administración y permite entrar en `/admin`. Next.js reenvía las consultas
`/api/admin/*` a `/admin/*` del backend con `API_PROXY_TARGET`. Este prefijo evita
confundir la página del frontend con los endpoints del backend; el gateway
generado deja `/admin` y `/api/admin/*` en Next.js.

Next.js sigue siendo compatible con FastAPI: al no disponer este backend del
contrato de administración, no muestra el enlace. React Router y Astro todavía
no incluyen esta interfaz. No declares esta capacidad como requisito obligatorio
de todos los frontends.

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

- `GET /admin/access`: devuelve `{ allowed: boolean }` para descubrir el acceso.
- `GET /admin/overview?days=30`: resumen, con un periodo de 1 a 365 días.
- `GET /admin/users?page=1&pageSize=25&search=...`.
- `GET /admin/organizations?page=1&pageSize=25&search=...`.
- `GET /admin/subscriptions?page=1&pageSize=25&search=...`.

Las listas devuelven `{ items, total, page, pageSize }`, con un máximo de 100
elementos por página. Sin permiso global, las consultas de datos responden
`403 PLATFORM_ADMIN_REQUIRED`. Una sesión ausente o inválida no permite consultar
datos aunque se acceda directamente a la API.

## Comprobaciones

Desde la raíz, `npm run test:e2e:admin` ejecuta pruebas de navegador de la interfaz
con respuestas HTTP simuladas, sin necesitar PostgreSQL ni Redis. Estas pruebas
no sustituyen la comprobación del backend: los tests del starter NestJS cubren
la autorización, consultas y concesiones globales. Consulta también sus comandos
de build y E2E en el README de cada starter.
