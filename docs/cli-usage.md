# Uso de la CLI

Instala y ejecuta la versión publicada con `npx`:

```sh
npx @soymanolo/create-my-saas@latest my-saas --backend nestjs --frontend nextjs
```

Para desarrollar la CLI desde este checkout:

```sh
node packages/cli/bin/create-my-saas.js my-saas --backend nestjs --frontend nextjs
node packages/cli/bin/create-my-saas.js my-saas --backend nestjs --frontend astro --feature billing
```

También se puede generar una sola capa:

```sh
node packages/cli/bin/create-my-saas.js api-only --backend fastapi
node packages/cli/bin/create-my-saas.js public-site --frontend astro
```

Para ver el catálogo disponible:

```sh
node packages/cli/bin/create-my-saas.js --list
```

## Preparar un proyecto local

Después de generarlo, la CLI puede crear los archivos locales de configuración
sin sobrescribir ninguno que ya exista:

```sh
node packages/cli/bin/create-my-saas.js setup ./my-saas
node packages/cli/bin/create-my-saas.js doctor ./my-saas --no-services
```

`setup` crea `backend/.env`, `frontend/.env` y `deployment/.env` según las capas
seleccionadas. Genera un `SECRET_KEY` aleatorio para desarrollo, alinea el modelo
de producto con el manifiesto y usa las URL locales del backend seleccionado.
Estos archivos están cubiertos por `.gitignore`; no los añadas al repositorio.
Si alguno ya existe, se conserva. `deployment/.env` es para el Compose local;
no copies encima `.env.production.example`. Para producción sigue
[la guía de despliegue](deployment.md).

Con PostgreSQL y Redis arrancados, ejecuta `doctor` sin `--no-services` para
comprobar también que sus puertos responden. Esa prueba TCP no valida usuario,
contraseña ni migraciones; `/ready` verifica la disponibilidad real de la API.
En desarrollo, los correos transaccionales se omiten si no configuras un
adaptador de entrega. Configúralo para probar verificación y recuperación reales.

## Cargar datos de demostración

Con la API local iniciada y `/ready` disponible:

```sh
node packages/cli/bin/create-my-saas.js seed ./my-saas
```

`seed` crea dos usuarios (`demo-owner@example.com` y
`demo-member@example.com`) y prepara el espacio personal del propietario si
el modelo es `individual` o `mixed`. En `teams` y `mixed` crea además un equipo
`Demo Workspace`, propiedad del primer usuario. El segundo usuario sirve para
probar el acceso con otra cuenta; no se le asigna un rol de equipo. Una nueva
ejecución reutiliza las cuentas y el equipo.

La contraseña aleatoria se guarda en `./my-saas/.env.demo`, excluido por el
`.gitignore` generado. `seed` solo actúa con `APP_ENV=development`, PostgreSQL
local y el adaptador de correo desactivado; nunca apunta a una API externa.
El archivo de credenciales permite repetir el comando y no debe copiarse a un
despliegue. Para proyectos solo frontend no hay backend que poblar.

## Modelo individual, equipos o mixto

Desde la versión 1.8.0, la CLI admite `--product-model individual|teams|mixed`:

```sh
node packages/cli/bin/create-my-saas.js personal --backend fastapi --frontend nextjs --product-model individual
```

El modo individual prepara un espacio personal automáticamente y permite
gestionar la suscripción sin crear una organización manualmente. El modo mixto
añade equipos con suscripciones separadas. FastAPI y NestJS mantienen `teams`
como valor predeterminado; Fastify sólo admite `individual` y no incluye billing.
Consulta [los modelos y su compatibilidad](product-models.md).

La CLI no sobrescribe directorios existentes. Cada proyecto generado incluye
`.create-my-saas.json` con los IDs y versiones de las plantillas elegidas, y no
copia dependencias, entornos virtuales ni artefactos de compilación locales.

## Combinaciones

| Necesidad | Combinación recomendada |
| --- | --- |
| Dashboard TypeScript con API completa | `--backend nestjs --frontend nextjs` |
| Dashboard Python con API completa | `--backend fastapi --frontend nextjs` |
| App React con SSR/Framework Mode y billing | `--backend nestjs --frontend react-router` o `--backend fastapi --frontend react-router` |
| Landing, blog o documentación sin área privada | `--frontend astro` |
| Sitio Astro con área privada ligera | `--backend nestjs --frontend astro`, `--backend fastapi --frontend astro` o `--backend fastify --frontend astro` |
| Sitio Astro con organizaciones y Stripe | `--backend nestjs --frontend astro --feature billing` o `--backend fastapi --frontend astro --feature billing` |
| API ligera con autenticación completa | `--backend fastify` |

Los frontends de sesión usan un proxy same-origin configurado mediante
`API_PROXY_TARGET`. Después de generar un proyecto, copia sus archivos de
entorno de ejemplo, configura secretos, URL de PostgreSQL y proveedores que
uses; consulta el README de cada starter para los detalles propios del runtime.

Para actualizar una aplicación existente, consulta [la guía de actualización](./upgrading.md).
`upgrade` también añade módulos Pro a un proyecto existente (`--feature` con
`--extensions-dir`) o los cambia de versión (`--base-extensions-dir` con la
versión actual y `--extensions-dir` con la nueva); consulta
[Añadir o actualizar módulos Pro](./upgrading.md#añadir-o-actualizar-módulos-pro).

## Referencias de los starters

- [FastAPI](../templates/backend/fastapi-starter/README.md), [NestJS](../templates/backend/nestjs-starter/README.md) y [Fastify](../templates/backend/fastify-starter/README.md).
- [Next.js](../templates/frontend/nextjs-starter/README.md), [React Router](../templates/frontend/react-router-starter/README.md) y [Astro](../templates/frontend/astro-starter/README.md).
- [Contrato operativo común de los backends](../templates/backend/backend-infrastructure-contract.md).

## Portada y planes

Next.js y React Router muestran una portada pública; Astro ofrece una página pública de precios. Con FastAPI o NestJS, configura `STRIPE_PRICE_PLANS` con `name`, `entitlements`, `labels` y, opcionalmente, `priceLabel` para mostrar el escaparate sin consultar Stripe. La compra requiere sesión y confirmación en Facturación. Para contratar desde Astro añade `--feature billing`. Fastify no ofrece planes de facturación.
