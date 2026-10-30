# Actualizar un proyecto generado

Desde la carpeta del proyecto, con el repositorio de git sin cambios pendientes:

```sh
npx @soymanolo/create-my-saas@latest upgrade --dry-run   # qué cambiaría
npx @soymanolo/create-my-saas@latest upgrade
```

La CLI regenera el proyecto con la versión de la que viene (descargándola de
npm) y con la actual, y compara cada archivo con tu copia:

- si no lo has tocado, se sustituye por el de la versión nueva;
- si lo has cambiado y la plantilla también, se fusionan las dos versiones;
  cuando chocan quedan marcas `<<<<<<<` que debes resolver (y el comando sale
  con código 2);
- los archivos nuevos de la plantilla se añaden y los que la plantilla elimina
  se borran solo si no los has modificado;
- tus archivos propios no se tocan.

Revisa el resultado con `git diff` y haz commit. Los proyectos creados antes de
que `.create-my-saas.json` guardara la versión de la CLI necesitan indicarla una
vez con `--from <versión>`. Las rutas de `unmanaged` en ese archivo no se
actualizan nunca, para lo que hayas personalizado a fondo. Si usaste extensiones
de una carpeta local (por ejemplo, Pro), vuelve a pasar `--extensions-dir`.

## Añadir o actualizar módulos Pro

Los módulos Pro se entregan como carpetas locales y también pueden añadirse o
cambiar de versión en un proyecto ya generado. La fusión es la misma: la base se
genera con los módulos que el proyecto tiene ahora y la versión nueva con los que
quieres tener, así que tus cambios se conservan.

Para añadir un módulo, pasa su ID con `--feature` (repetible) y su carpeta con
`--extensions-dir`:

```sh
npx @soymanolo/create-my-saas upgrade --feature object-storage-nestjs --extensions-dir ./pro-object-storage-1.2.0
```

Sus archivos aparecen como añadidos y los registros generados (por ejemplo
`src/extensions/*.generated.ts` en NestJS) y los `.env.example` se fusionan con
los tuyos. Si el proyecto ya usa otros módulos Pro, pasa también sus carpetas con
`--extensions-dir`.

Para cambiar la versión de un módulo, pasa la carpeta de la versión que tiene el
proyecto con `--base-extensions-dir` y la de la versión nueva con
`--extensions-dir` (ambas repetibles):

```sh
npx @soymanolo/create-my-saas upgrade --base-extensions-dir ./pro-object-storage-1.1.0 --extensions-dir ./pro-object-storage-1.2.0
```

Sin `--base-extensions-dir`, las carpetas de `--extensions-dir` sirven para las
dos generaciones, como hasta ahora. Antes de generar nada, la CLI compara las
versiones de las carpetas con las que guarda `.create-my-saas.json` y se detiene
si no coinciden, por ejemplo: «El proyecto usa
pro:object-storage-nestjs@1.1.0; pasa su carpeta con --base-extensions-dir.».
Así nunca se calcula una diferencia con la versión equivocada.

Si la versión de la CLI no cambia, solo se actualizan los módulos: la base se
genera con la propia CLI, sin descargar nada. Si la CLI también es más nueva, los
dos cambios llegan juntos. Ambas opciones se combinan con `--dry-run` y
`--allow-dirty`, y el resumen indica los módulos que cambian, por ejemplo
`Módulos: + pro:x@1.2.0, pro:y 1.1.0 → 1.2.0`.

Consulta también [los modelos de producto](./product-models.md) y [el contrato de extensiones](./extension-manifests.md).

## Next.js: portada pública y panel en /app

En la nueva plantilla Next.js, `/` es pública y el panel anterior vive en `/app`. Revisa enlaces, marcadores, pruebas y redirecciones personalizadas. Para conservar el comportamiento anterior, sustituye `app/page.tsx` por el panel protegido de `app/app/page.tsx`, ajusta sus imports al directorio raíz y cambia la navegación y el destino predeterminado tras login de `/app` a `/`. Mantén una copia de tus cambios antes de ejecutar upgrade y resuelve cualquier conflicto manualmente.
