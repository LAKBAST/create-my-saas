# Resolución de problemas

Los mensajes siguientes proceden de la CLI y de los backends incluidos. Los
campos entre `<...>` representan valores que dependen del proyecto. Ejecuta los
comandos desde la raíz del proyecto generado salvo que se indique otra ruta;
los de generación se ejecutan desde su directorio padre. Los ejemplos de edición
usan PowerShell y `notepad`; puedes sustituirlo por tu editor habitual.

## El frontend no es compatible con el backend

Mensaje de [generator.js](../packages/cli/src/generator.js):

```text
Error: Frontend "<frontend>" is not compatible with backend "<backend>". Missing backend capabilities: <capacidades>.
```

**Causa:** el backend no ofrece todas las capacidades exigidas por el frontend.
Por ejemplo, Next.js y React Router requieren organizaciones y Stripe Billing,
que Fastify no incluye.

**Solución:** consulta las plantillas y elige una combinación compatible; por
ejemplo, FastAPI con Next.js, o Fastify con Astro sin la extensión de billing.

```sh
npx @lakbast/create-my-saas --list
npx @lakbast/create-my-saas mi-saas --backend fastapi --frontend nextjs
# Alternativa ligera, en otro destino:
npx @lakbast/create-my-saas mi-sitio --backend fastify --frontend astro
```

## El directorio de destino ya existe

```text
Error: Destination already exists: <ruta-absoluta>
```

**Causa:** la CLI rechaza cualquier destino existente, aunque esté vacío, para
no sobrescribir archivos ([generator.js](../packages/cli/src/generator.js)).

**Solución:** genera en una ruta nueva. Si querías actualizar un proyecto ya
generado, utiliza `upgrade`, no vuelvas a generarlo encima.

```sh
npx @lakbast/create-my-saas mi-saas-nuevo --backend fastapi --frontend nextjs
# Para revisar una actualización del proyecto existente:
npx @lakbast/create-my-saas upgrade ./mi-saas --dry-run
```

## No se ha seleccionado backend ni frontend

```text
Error: Select at least one template with --backend or --frontend.
```

**Causa:** se proporcionó un destino sin seleccionar ninguna capa
([generator.js](../packages/cli/src/generator.js)).

**Solución:** añade al menos una de las dos opciones. Puedes generar una API sola.

```sh
npx @lakbast/create-my-saas mi-api --backend fastapi
```

## Upgrade encuentra cambios sin guardar en Git

```text
Error: Commit or stash your changes before upgrading (or use --allow-dirty).
```

**Causa:** `upgrade` detecta cambios mediante `git status --porcelain`, incluidos
archivos sin seguimiento, y bloquea la escritura. `--dry-run` permite revisar el
plan sin exigir un árbol limpio ([upgrade.js](../packages/cli/src/upgrade.js)).

**Solución:** revisa el estado y guarda temporalmente los cambios antes de aplicar
la actualización. Recupera el stash después de revisar y guardar el resultado
del upgrade; su recuperación también puede requerir resolver conflictos.

```sh
git status --short
npx @lakbast/create-my-saas upgrade --dry-run
git stash push -u -m "Trabajo previo a la actualización"
npx @lakbast/create-my-saas upgrade
git diff
```

`--allow-dirty` omite esta protección; no resuelve ni guarda los cambios previos.

## Upgrade termina con conflictos y código de salida 2

El resumen contiene este encabezado (el número varía):

```text
Con conflictos (resuélvelos antes de hacer commit) (<cantidad>):
```

Y esta indicación exacta:

```text
Busca las marcas <<<<<<< en los archivos con conflictos; los binarios dejan la versión nueva en <archivo>.upgrade-new.
```

**Causa:** la versión local y la plantilla nueva modificaron el mismo contenido
y la fusión de tres vías no pudo resolverlo. La CLI devuelve **2**, también en
`--dry-run` si el plan contiene conflictos. Sin `--dry-run`, ya ha escrito los
cambios y actualizado el manifiesto; no se trata de un `git merge` pendiente
([upgrade.js](../packages/cli/src/upgrade.js), [cli.js](../packages/cli/src/cli.js)).

**Solución:** si era una simulación, revisa las rutas indicadas antes de aplicar.
Si ya se aplicó, edita cada archivo listado, resuelve las marcas `<<<<<<<`,
`=======` y `>>>>>>>` y compara los binarios con sus `.upgrade-new`. Conserva la
versión elegida y elimina el archivo auxiliar tras revisarlo. No repitas el
upgrade como forma de resolver los conflictos. Revisa y prueba el resultado
antes de añadir las rutas resueltas y hacer commit.

```sh
git diff
git diff --check
git status --short
```

## Doctor no encuentra la configuración local

Etiquetas exactas que aparecen con el prefijo `FIX`:

```text
FIX Backend .env
FIX Frontend .env
FIX Local Compose .env
```

**Causa:** faltan los archivos `.env` de las capas seleccionadas o el de
`deployment/`. Cada línea continúa con la acción recomendada. Las comprobaciones
de esta sección y las siguientes proceden de
[local-setup.js](../packages/cli/src/local-setup.js); `doctor` devuelve 1 si hay
algún fallo y muestra `Local project needs attention.`.

**Solución:** ejecuta `setup` y comprueba los archivos sin probar los servicios.
`setup` conserva los `.env` existentes; si ya contienen valores incorrectos,
corrígelos con tu editor.

```sh
npx @lakbast/create-my-saas setup .
npx @lakbast/create-my-saas doctor . --no-services
```

## Doctor detecta una clave local insegura

Etiqueta: "FIX Local SECRET_KEY is configured".

**Causa:** `SECRET_KEY` tiene menos de 32 caracteres o contiene `replace`,
`change-me` o `example`.

**Solución:** genera una clave y copia el resultado en `SECRET_KEY` de
`backend/.env`. Si usas la API en Compose, actualiza también `deployment/.env`.

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
notepad backend/.env
notepad deployment/.env
npx @lakbast/create-my-saas doctor . --no-services
```

## Doctor detecta un entorno o modelo de producto incorrecto

Etiquetas:

```text
FIX Backend uses development mode
FIX Product model matches <modelo>
```

**Causa:** `APP_ENV` no es `development`, o `PRODUCT_MODEL` no coincide con el
modelo registrado en `.create-my-saas.json`. `doctor` está orientado al desarrollo
local; no es un validador del despliegue de producción.

**Solución:** para el entorno local, establece `APP_ENV=development` y el
`PRODUCT_MODEL` indicado en el mensaje, también en `deployment/.env` si usas
Compose. No cambies el entorno de un despliegue real para satisfacer `doctor`.

```powershell
Get-Content .create-my-saas.json
notepad backend/.env
notepad deployment/.env
npx @lakbast/create-my-saas doctor . --no-services
```

## Doctor detecta una URL de PostgreSQL o Redis ausente o inválida

Etiquetas (según la variable afectada):

```text
FIX DATABASE_URL is configured
FIX REDIS_URL is configured
FIX DATABASE_URL has a valid URL
FIX REDIS_URL has a valid URL
```

**Causa:** falta la variable en `backend/.env` o no se puede interpretar como URL.

**Solución:** edita las URL para los servicios locales. FastAPI usa
`postgresql+asyncpg://postgres:postgres@localhost:5432/app`; NestJS y Fastify usan
`postgresql://postgres:postgres@localhost:5432/app`. Redis local usa
`redis://localhost:6379`. Sustituye credenciales, host, puerto y base si tu
instalación difiere.

```powershell
notepad backend/.env
npx @lakbast/create-my-saas doctor . --no-services
```

## Doctor no puede conectar con PostgreSQL o Redis

Etiquetas:

```text
FIX DATABASE_URL host responds on TCP
FIX REDIS_URL host responds on TCP
```

**Causa:** el host y puerto de la URL no responden por TCP dentro del tiempo de
espera. Es habitual que todavía no se hayan arrancado los servicios locales.

**Solución:** desde la raíz del proyecto, arranca PostgreSQL y Redis con la
configuración local creada por `setup` y vuelve a comprobarlos.

```sh
cd deployment
docker compose -f compose.yaml -f compose.dev.yaml --env-file .env up -d postgres redis
cd ..
npx @lakbast/create-my-saas doctor .
```

Si siguen fallando, revisa host y puerto en `backend/.env`. Un resultado `OK`
sólo confirma conectividad TCP: no valida autenticación, TLS ni migraciones.
`--no-services` omite la conexión, por lo que tampoco acredita disponibilidad.

## Doctor detecta una URL pública o un proxy del frontend incorrectos

Etiquetas:

```text
FIX Frontend public URL is configured
FIX Frontend API proxy matches the selected backend
```

**Causa:** la URL pública está vacía o contiene `example.com`, o
`API_PROXY_TARGET` no coincide con el backend seleccionado.

**Solución:** en `frontend/.env`, establece la URL pública local
`http://localhost:3000` en la variable correspondiente: `NEXT_PUBLIC_SITE_URL`
para Next.js, `VITE_PUBLIC_SITE_URL` para React Router o `PUBLIC_SITE_URL` para
Astro. Para ejecución en el host, el proxy debe ser `http://localhost:8000`
(FastAPI), `http://localhost:3001` (NestJS) o `http://localhost:3002` (Fastify).
El proxy se comprueba sólo si se seleccionó backend.

```powershell
notepad frontend/.env
npx @lakbast/create-my-saas doctor . --no-services
```

## El backend rechaza Redis sin TLS en staging o production

FastAPI y NestJS muestran:

```text
RATE_LIMIT_ENABLED and a TLS REDIS_URL (rediss://) are required in production.
```

Fastify muestra:

```text
RATE_LIMIT_ENABLED and a TLS REDIS_URL (rediss://) are required in staging and production.
```

**Causa:** en los tres backends, la validación de arranque se aplica tanto a
`staging` como a `production`, aunque los dos primeros mensajes sólo mencionen
producción. Falta Redis con TLS o está desactivado el límite distribuido.

**Solución:** provisiona Redis con TLS y configura en el entorno de despliegue
`RATE_LIMIT_ENABLED=true` y `REDIS_URL=rediss://<usuario>:<clave>@<host>:<puerto>`
con los datos reales del proveedor. Cambiar únicamente el prefijo de una URL no
activa TLS en el servidor. Si usas el Compose generado, edita `deployment/.env`
y recrea la API desde la raíz del proyecto:

```powershell
notepad deployment/.env
docker compose -f deployment/compose.yaml --env-file deployment/.env up -d --force-recreate api
docker compose -f deployment/compose.yaml --env-file deployment/.env logs --tail 100 api
```

El override `compose.dev.yaml` utiliza Redis sin TLS y es exclusivamente local.
Fuentes: [FastAPI settings](../templates/backend/fastapi-starter/src/core/config/settings.py),
[NestJS config](../templates/backend/nestjs-starter/src/config.ts) y
[Fastify config](../templates/backend/fastify-starter/src/config.ts).

## El backend rechaza el correo sin configurar

Mensaje de arranque común a los tres backends:

```text
EMAIL_DELIVERY_URL (HTTPS) and EMAIL_DELIVERY_TOKEN are required in staging and production.
```

**Causa:** en `staging` o `production` falta una URL HTTPS de entrega o el token.
La validación impide arrancar sin esa configuración. Además, el envío seguro
rechaza la ausencia de configuración en esos entornos: FastAPI y NestJS usan
"Secure email delivery is not configured."; Fastify usa
"Secure email delivery is unavailable.".

**Solución:** configura un servicio de correo que acepte el contrato del adaptador
del starter, con `EMAIL_DELIVERY_URL=https://<endpoint-real>` y
`EMAIL_DELIVERY_TOKEN=<token-real>`. El adaptador envía un POST JSON con `to`,
`subject`, `text` y, cuando corresponde, `html` y `from`, autenticado mediante
`Authorization: Bearer`. Añade `EMAIL_FROM` si el proveedor requiere remitente.
Para Compose, edita el entorno y recrea la API:

```powershell
notepad deployment/.env
docker compose -f deployment/compose.yaml --env-file deployment/.env up -d --force-recreate api
docker compose -f deployment/compose.yaml --env-file deployment/.env logs --tail 100 api
```

En desarrollo, la ausencia de configuración puede suprimir el envío; arrancar
localmente no demuestra que se entregue correo. Fuentes: las configuraciones
enlazadas en el problema anterior y los adaptadores de
[FastAPI](../templates/backend/fastapi-starter/src/core/email.py),
[NestJS](../templates/backend/nestjs-starter/src/auth/secure-email.service.ts) y
[Fastify](../templates/backend/fastify-starter/src/email.ts).

## Checkout, Portal o webhooks de Stripe están deshabilitados

Mensajes de FastAPI y NestJS:

```text
Stripe billing is not configured.
Stripe webhooks are not configured.
```

**Causa:** Stripe es opcional en estos dos backends, también en `staging` y
`production`. Sin configuración completa, Checkout devuelve
`{"configured":false,"url":null,"sessionId":null}` y Portal devuelve
`{"configured":false,"url":null,"reason":"Stripe billing is not configured."}`.
Los webhooks sin secreto devuelven HTTP 503 con código `BILLING_NOT_CONFIGURED`.
Esto no bloquea por sí solo el arranque. Fastify no incluye Stripe Billing.

Una configuración parcial sí bloquea el arranque con:

```text
STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be configured together.
```

**Solución:** para habilitar cobros, configura ambas claves y un
`STRIPE_PRICE_PLANS` no vacío. Usa identificadores reales de precios y el secreto
del endpoint de webhooks correspondiente al mismo entorno de Stripe. Por ejemplo,
el valor de planes puede tener la forma
`{"price_REAL":{"name":"pro","entitlements":{"api_calls":10000}}}`,
sustituyendo `price_REAL`. Registra el webhook de tu backend según su README y
recrea la API para cargar las variables:

```powershell
notepad deployment/.env
docker compose -f deployment/compose.yaml --env-file deployment/.env up -d --force-recreate api
docker compose -f deployment/compose.yaml --env-file deployment/.env logs --tail 100 api
```

Si no vas a ofrecer cobros, conserva ambas claves sin configurar y trata
`configured:false` como integración deshabilitada. Fuentes:
[servicio FastAPI](../templates/backend/fastapi-starter/src/modules/billing/service.py),
[servicio NestJS](../templates/backend/nestjs-starter/src/billing/billing.service.ts)
y sus validaciones de configuración enlazadas anteriormente.
