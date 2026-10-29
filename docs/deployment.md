# Despliegue reproducible

Cada proyecto generado incluye `deployment/`, `compose.yaml`,
`compose.dev.yaml` y `.env.production.example`. Las imágenes y los servicios
se adaptan a las plantillas seleccionadas: un proyecto solo backend incluye API
y migración; uno solo frontend incluye frontend y gateway; uno completo incluye
ambos lados. El gateway TLS se genera cuando hay frontend. Una API sin frontend
necesita un proxy TLS externo para su exposición pública.

Los comandos siguientes parten de la raíz del repositorio para usar la CLI.
Los comandos de Docker Compose se ejecutan dentro de `deployment/` del proyecto
generado. Requieren Docker con Compose; la CLI requiere Node.js 20 o posterior.
Consulta [el catálogo de plantillas](./template-manifests.md) para elegir una
combinación compatible y [los modelos de producto](./product-models.md) para
configurar las cuentas.

## Desarrollo local

Genera, prepara los archivos de entorno y comprueba su configuración:

```sh
node packages/cli/bin/create-my-saas.js mi-saas --backend fastapi --frontend nextjs
node packages/cli/bin/create-my-saas.js setup ./mi-saas
node packages/cli/bin/create-my-saas.js doctor ./mi-saas --no-services
```

`setup [proyecto]` crea `backend/.env`, `frontend/.env` y `deployment/.env` según
las plantillas presentes, genera un secreto local y conserva los archivos
existentes. El directorio predeterminado de `setup`, `doctor` y `seed` es `.`.
`doctor` comprueba los archivos y, salvo con `--no-services`, la conectividad TCP
de las URL locales de PostgreSQL y Redis; no verifica sus credenciales.

Para el proyecto completo del ejemplo, entra en `mi-saas/deployment/`:

```sh
docker compose -f compose.yaml -f compose.dev.yaml --env-file .env up -d postgres redis
docker compose -f compose.yaml -f compose.dev.yaml --env-file .env --profile migrate run --rm migrate
docker compose -f compose.yaml -f compose.dev.yaml --env-file .env up --build api frontend
```

El frontend se publica por defecto en `http://localhost:3000` y la API en
`http://127.0.0.1:8000`. El override usa `APP_ENV=development`, PostgreSQL y Redis
sin TLS. Sus datos se conservan en los volúmenes `postgres-data` y `redis-data`;
`down -v` los elimina. No uses esta configuración en producción ni sobrescribas
el `.env` creado por `setup` con el ejemplo de producción.

`seed [proyecto]` crea cuentas de demostración a través de una API local ya
iniciada y guarda las credenciales en `.env.demo`, ignorado por Git. Exige
`APP_ENV=development`, una URL local de PostgreSQL y `EMAIL_DELIVERY_URL` vacío.
Usa los puertos locales de los starters: FastAPI `8000`, NestJS `3001` y Fastify
`3002`. El Compose integrado publica la API en `8000` por defecto: para usar
`seed` con NestJS o Fastify, ajusta `API_PORT` al puerto correspondiente en
`deployment/.env` y vuelve a crear el servicio API. Los puertos publicados de
Compose se configuran con `API_PORT` y `FRONTEND_PORT`.

## Producción

Con backend, la receta mantiene PostgreSQL y Redis fuera de Compose para usar
servicios gestionados con TLS. Copia `deployment/.env.production.example` a
`deployment/.env` en el entorno de producción, sustituye todos los secretos y
las URL de ejemplo y configura el envío de correo. OAuth y Stripe requieren
configuración adicional cuando se utilizan. `PRODUCT_MODEL` debe coincidir con
el modelo elegido al generar el proyecto.

Con frontend, entrega los certificados al gateway en `certs/fullchain.pem` y
`certs/privkey.pem`, relativos a `deployment/`. Mantén `GATEWAY_IP` y
`TRUSTED_PROXY_IPS` coherentes. Para un proyecto completo, ejecuta desde
`deployment/`:

```sh
docker compose --env-file .env --profile migrate run --rm migrate
docker compose --env-file .env --profile production up -d --build
```

Ejecuta `migrate` como trabajo de publicación antes de arrancar las réplicas de
la API. Una generación solo frontend no necesita ese servicio. En una generación
solo backend, arranca `api` sin el perfil `production` y configura el proxy TLS
externo sobre el puerto de loopback, o ajusta `API_BIND_ADDRESS` y `API_PORT`.

La API expone `/health` para comprobar que el proceso está vivo y `/ready` para
comprobar PostgreSQL y Redis, este último cuando el límite distribuido está
activo. Compose usa `/ready` como healthcheck; cuando hay API y gateway, el
gateway espera a que la API esté saludable antes de enrutar tráfico.

El `deployment/README.md` generado detalla la receta según las plantillas
seleccionadas. Revisa también las copias de seguridad, las pruebas de
restauración y la rotación de secretos de los servicios gestionados antes de
usar el despliegue con datos reales.
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
