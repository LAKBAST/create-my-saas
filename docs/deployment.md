# Despliegue reproducible

Cada proyecto creado por la CLI incluye un directorio `deployment/`. Contiene
imágenes multi-stage para el backend y el frontend seleccionados, un gateway
TLS de mismo origen, `compose.yaml`, un override local con PostgreSQL y Redis,
y un ejemplo de variables de producción.

La receta de producción mantiene PostgreSQL y Redis fuera de Compose para que
se usen servicios gestionados y cifrados. Copia
`deployment/.env.production.example` a `deployment/.env`, reemplaza los
secretos y las URL de ejemplo, entrega el certificado TLS al gateway y ejecuta
el contenedor `migrate` como trabajo de release antes de arrancar la API.

La API conserva `/health` como liveness local y expone `/ready` como
readiness con timeout corto para PostgreSQL y Redis cuando el límite distribuido
está activo. Compose usa `/ready` como healthcheck y el gateway espera a que la
API esté healthy antes de enrutar tráfico.

Consulta el `deployment/README.md` generado para los comandos exactos y los
requisitos de proxy, copias de seguridad y restauración. La receta local de
`compose.dev.yaml` usa datos efímeros sin TLS y no debe usarse como producción.

## Requisitos para producción

Antes de poner un SaaS real en línea todavía hay que conectar las integraciones
del producto final. No es código ausente de los starters: son servicios y
credenciales que pertenecen a cada despliegue. Configura PostgreSQL, Redis con
TLS, la entrega transaccional de correo y las credenciales OAuth de los
proveedores que ofrezcas. Si vas a cobrar, configura también Stripe, los precios
permitidos y el endpoint de webhooks.

FastAPI, NestJS y Fastify exigen explícitamente los servicios de los que
dependen en `staging` y `production` y fallan de forma segura si faltan o no se
pueden usar. En particular, los límites de petición requieren Redis mediante
`rediss://` y los flujos de cuenta requieren una entrega de correo autenticada.
FastAPI y NestJS también dejan Checkout, Portal y webhooks de Stripe
deshabilitados hasta que se proporcione una configuración válida. Consulta el
README y el archivo `.env.example` del starter generado para los nombres de
variables y los callbacks registrados.

Consulta el [contrato operativo común](../templates/backend/backend-infrastructure-contract.md) para los detalles de infraestructura.
