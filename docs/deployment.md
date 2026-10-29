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

## Preset Coolify

Los proyectos nuevos incluyen `deployment/compose.coolify.yaml` y
`deployment/COOLIFY.md`. Este preset usa la aplicación Docker Compose desde Git
de Coolify, con variables obligatorias validadas por interpolación. Coolify
termina TLS; el gateway HTTP generado mantiene frontend y API bajo el mismo
origen sin publicar puertos del host. PostgreSQL y Redis siguen siendo externos.
El trabajo `migrate` se ejecuta manualmente una sola vez por versión antes de
servir la API. El preset también cubre API sin frontend y Astro estático.

La receta Compose genérica sigue disponible. Al actualizar proyectos existentes,
`create-my-saas upgrade --dry-run` muestra los archivos nuevos o los conflictos
antes de escribir. El upgrade preserva `.env` y los archivos editados. Consulta
la [documentación de Compose de Coolify](https://coolify.io/docs/applications/builds/docker-compose)
para configurar el archivo del repositorio, las variables y el dominio.
