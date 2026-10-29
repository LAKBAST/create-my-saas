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

Consulta también [los modelos de producto](./product-models.md) y [el contrato de extensiones](./extension-manifests.md).

## Next.js: portada pública y panel en /app

En la nueva plantilla Next.js, `/` es pública y el panel anterior vive en `/app`. Revisa enlaces, marcadores, pruebas y redirecciones personalizadas. Para conservar el comportamiento anterior, sustituye `app/page.tsx` por el panel protegido de `app/app/page.tsx`, ajusta sus imports al directorio raíz y cambia la navegación y el destino predeterminado tras login de `/app` a `/`. Mantén una copia de tus cambios antes de ejecutar upgrade y resuelve cualquier conflicto manualmente.
