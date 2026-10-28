---
title: Instalación
description: Requisitos para usar la CLI y ejecutar los proyectos generados.
---

La CLI no necesita instalarse: se ejecuta con `npx`, que descarga la última
versión publicada en npm.

```sh
npx @soymanolo/create-my-saas@latest --help
```

## Requisitos

| Herramienta | Para qué | Versión |
| --- | --- | --- |
| [Node.js](https://nodejs.org/) | Ejecutar la CLI y las plantillas TypeScript | 20 o superior |
| [Docker](https://docs.docker.com/get-docker/) con Compose | PostgreSQL y Redis locales, y la receta de despliegue | Compose v2 |
| [Git](https://git-scm.com/) | Versionar el proyecto y usar `upgrade` | Cualquiera reciente |

Si eliges el backend **FastAPI** necesitarás también Python y las herramientas
que indica el `README.md` de `backend/` en el proyecto generado.

## Comprobar el catálogo

Para ver las plantillas y extensiones disponibles en la versión que vas a usar:

```sh
npx @soymanolo/create-my-saas@latest --list
```

## Instalación global (opcional)

Si prefieres tener el comando siempre disponible:

```sh
npm install --global @soymanolo/create-my-saas
create-my-saas --help
```

Con la instalación global tendrás que actualizarla tú; con `npx …@latest`
siempre usas la última versión.

## Siguiente paso

[Genera tu primer proyecto](../quick-start/).
