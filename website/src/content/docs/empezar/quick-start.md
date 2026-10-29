---
title: Quick start
description: De cero a un SaaS funcionando en local en unos minutos.
---

Esta guía genera un proyecto con **NestJS** y **Next.js**, lo configura y lo
arranca en local con Docker. Necesitas los [requisitos](../instalacion/)
instalados y Docker en marcha.

## 1. Genera el proyecto

```sh
npx @soymanolo/create-my-saas@latest my-saas --backend nestjs --frontend nextjs
cd my-saas
```

La CLI crea `backend/`, `frontend/` y `deployment/`, además de
`.create-my-saas.json`, que registra las plantillas y versiones elegidas. Nunca
sobrescribe un directorio que ya exista.

## 2. Crea la configuración local

```sh
npx @soymanolo/create-my-saas@latest setup
```

`setup` crea `backend/.env`, `frontend/.env` y `deployment/.env` con un
`SECRET_KEY` aleatorio de desarrollo y las URL locales correctas. Si alguno de
esos archivos ya existe, lo conserva. Están en `.gitignore`: no los subas al
repositorio.

## 3. Arranca PostgreSQL y Redis

```sh
cd deployment
docker compose -f compose.yaml -f compose.dev.yaml --env-file .env up -d postgres redis
cd ..
```

Comprueba que todo está en su sitio:

```sh
npx @soymanolo/create-my-saas@latest doctor
```

`doctor` revisa la configuración y que los puertos de PostgreSQL y Redis
respondan.

## 4. Aplica las migraciones y arranca la aplicación

```sh
cd deployment
docker compose -f compose.yaml -f compose.dev.yaml --env-file .env --profile migrate run --rm migrate
docker compose -f compose.yaml -f compose.dev.yaml --env-file .env up --build api frontend
```

Abre [http://localhost:3000](http://localhost:3000). Ya puedes registrarte,
crear una organización e invitar a otros usuarios.

> **Nota.** En desarrollo, los correos transaccionales se omiten si no
> configuras un adaptador de entrega. Configúralo en `backend/.env` para probar
> la verificación de email y la recuperación de contraseña.

## 5. Carga datos de demostración (opcional)

Con la API en marcha, desde otra terminal en la raíz del proyecto:

```sh
npx @soymanolo/create-my-saas@latest seed
```

Crea `demo-owner@example.com` y `demo-member@example.com` y un equipo
`Demo Workspace`. La contraseña se guarda en `.env.demo`, también excluido de
git.

## Y ahora

- Prueba otras combinaciones: [plantillas disponibles](../../guias/plantillas/).
- Elige entre producto [individual, de equipos o mixto](../../referencia/product-models/).
- Prepara el [despliegue en producción](../../referencia/deployment/).
- Mantén el proyecto al día con [`upgrade`](../../referencia/upgrading/).
