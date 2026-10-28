---
title: CLI
description: Comandos y opciones de create-my-saas.
---

```text
create-my-saas <destino> [opciones]
create-my-saas upgrade [proyecto] [opciones de upgrade]
create-my-saas setup [proyecto]
create-my-saas doctor [proyecto] [--no-services]
create-my-saas seed [proyecto]
```

Si omites `[proyecto]`, los comandos actúan sobre el directorio actual.

## Generar un proyecto

```sh
create-my-saas my-saas --backend nestjs --frontend nextjs
```

| Opción | Descripción |
| --- | --- |
| `--backend <id>` | Plantilla de backend: `fastapi`, `nestjs` o `fastify`. |
| `--frontend <id>` | Plantilla de frontend: `nextjs`, `react-router` o `astro`. |
| `--product-model <modelo>` | `individual`, `teams` o `mixed`. Por defecto `teams` en los backends completos. Ver [modelos de producto](../product-models/). |
| `--feature <id>` | Activa una extensión, por ejemplo `billing` (repetible). |
| `--extensions-dir <ruta>` | Añade un directorio local de extensiones (repetible). Ver [extensiones](../extension-manifests/). |
| `--list` | Lista las plantillas disponibles. |
| `--help`, `-h` | Muestra la ayuda. |

Hace falta al menos `--backend` o `--frontend`. El destino no debe existir.

## `setup`

Crea `backend/.env`, `frontend/.env` y `deployment/.env` según las capas
generadas, con un `SECRET_KEY` aleatorio de desarrollo, el modelo de producto
del manifiesto y las URL locales del backend. Nunca sobrescribe un archivo que
ya exista.

## `doctor`

Comprueba la configuración local del proyecto y que PostgreSQL y Redis acepten
conexiones TCP. Con `--no-services` omite esa prueba de puertos. No valida
credenciales ni migraciones: para eso está el endpoint `/ready` de la API.

## `seed`

Con la API local iniciada, crea `demo-owner@example.com` y
`demo-member@example.com`, el espacio personal del propietario en los modelos
`individual` y `mixed`, y el equipo `Demo Workspace` en `teams` y `mixed`. La
contraseña se guarda en `.env.demo`. Solo actúa con `APP_ENV=development`,
PostgreSQL local y el correo desactivado. Ejecutarlo de nuevo reutiliza los
datos.

## `upgrade`

Actualiza el proyecto a la última versión de las plantillas, fusionando tus
cambios. Ver [actualizar un proyecto](../../guias/actualizar/).
