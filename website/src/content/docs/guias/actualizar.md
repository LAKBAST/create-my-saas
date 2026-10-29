---
title: Actualizar un proyecto
description: Trae las mejoras de nuevas versiones de las plantillas sin perder tus cambios.
---

`upgrade` actualiza un proyecto generado a la última versión de las plantillas
y conserva lo que hayas cambiado tú.

Desde la carpeta del proyecto, con el repositorio git sin cambios pendientes:

```sh
npx @soymanolo/create-my-saas@latest upgrade --dry-run   # qué cambiaría
npx @soymanolo/create-my-saas@latest upgrade
```

## Cómo funciona

La CLI regenera el proyecto con la versión de la que viene (descargándola de
npm) y con la actual, y compara cada archivo con tu copia:

- si no lo has tocado, se sustituye por el de la versión nueva;
- si lo has cambiado y la plantilla también, se fusionan las dos versiones;
  cuando chocan quedan marcas `<<<<<<<` que debes resolver (el comando sale con
  código 2);
- los archivos nuevos de la plantilla se añaden, y los que la plantilla elimina
  se borran solo si no los has modificado;
- tus archivos propios no se tocan.

Revisa el resultado con `git diff` y haz commit.

## Opciones

| Opción | Uso |
| --- | --- |
| `--dry-run` | Muestra qué cambiaría sin escribir nada. |
| `--from <versión>` | Versión de la CLI con la que se generó el proyecto. Solo hace falta una vez en proyectos antiguos cuyo `.create-my-saas.json` no la guarda. |
| `--allow-dirty` | Permite actualizar con cambios sin commitear. |
| `--extensions-dir <ruta>` | Directorio de extensiones locales usado al generar el proyecto (repetible). |
