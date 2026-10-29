# Cómo contribuir

Gracias por querer mejorar create-my-saas. El repositorio es público y acepta
contribuciones mediante pull requests contra `main`: haz un fork, trabaja en una
rama y abre el PR desde ella. Al contribuir aceptas que tu código se distribuya
bajo la [licencia MIT](./LICENSE) del proyecto.

Este repositorio es create-my-saas Community. create-my-saas Pro es un producto
comercial aparte, con módulos adicionales que se contratan en la
[Tienda LAKBAST](https://tienda.lakbast.com/store); lo que aportes aquí sigue
siendo MIT y forma parte de Community.

## Antes de empezar

- **Errores y propuestas**: abre un [issue](https://github.com/LAKBAST/create-my-saas/issues/new/choose)
  con la plantilla correspondiente. Busca antes si ya existe uno parecido.
- **Cambios grandes**: una plantilla nueva, una capacidad nueva o un cambio en el
  contrato HTTP necesitan un issue previo para acordar el enfoque antes de
  escribir código.
- **Seguridad**: no publiques vulnerabilidades en un issue. Usa
  *Security → Report a vulnerability* en el repositorio para informar en privado.
- **Rumbo del proyecto**: la [visión de Community](./docs/project.md) explica qué
  busca el proyecto y qué queda fuera.

## Qué encaja

- Correcciones y mejoras en la CLI (`packages/cli`), las plantillas
  (`templates/`), las extensiones (`extensions/`) y la documentación (`docs/`).
- Plantillas nuevas, siempre que sean autosuficientes: cada una declara su
  manifiesto, sus capacidades y su compatibilidad, y amplía las pruebas. Consulta
  [los manifiestos de plantillas](./docs/template-manifests.md).
- Cambios de comportamiento que mantengan la equivalencia entre plantillas.
  FastAPI define el contrato HTTP de referencia; si cambias un endpoint, aplica el
  cambio en los demás backends y frontends afectados y actualiza
  [la equivalencia de plantillas](./docs/template-parity.md) y
  [el contrato API](./docs/api-contract.md).

No se aceptan secretos, archivos `.env` reales, artefactos generados
(`node_modules`, `dist`, cachés) ni dependencias de registros o servicios privados.
La CI lo comprueba con `npm run audit:public`.

## Preparar el entorno

1. Haz un fork y clónalo.
2. Instala Node.js 24. Las comprobaciones de la raíz no necesitan instalar
   dependencias.
3. Para trabajar en una plantilla, sigue el README de su carpeta: cada starter
   tiene sus propias dependencias, su gestor de paquetes y sus comprobaciones.

## Comprobaciones antes del PR

Desde la raíz, las mismas que ejecuta siempre la CI:

```sh
npm run audit:public
npm run validate:templates
npm test
```

En Windows, dos pruebas que crean enlaces simbólicos pueden fallar con `EPERM`
si el usuario no tiene permiso para crearlos; pasan en Linux y en la CI.

Si tocas una plantilla, ejecuta también la verificación de su README. Los E2E de
proyectos generados se describen en [desarrollo y comprobaciones](./docs/development.md);
la CI los lanza solo para las plantillas afectadas por el cambio.

## Ramas, commits y pull requests

- Crea la rama desde `main` con un prefijo que indique el tipo:
  `fix/`, `feat/`, `docs/` o `chore/`.
- Escribe los commits en español con prefijo de
  [Conventional Commits](https://www.conventionalcommits.org/) y la descripción
  en imperativo, por ejemplo `fix: Corregir la recuperación de contraseña en
  Astro`. Explica en el cuerpo el motivo del cambio.
- Un PR resuelve una sola cosa. Rellena la plantilla del PR: qué cambia, por qué
  y cómo lo has probado.
- Si el cambio es visible para quien usa la CLI o los proyectos generados, añade
  una entrada en la sección `[Unreleased]` de [`CHANGELOG.md`](./CHANGELOG.md).
- La documentación de la web sale de `docs/`. Edita siempre `docs/*.md`, no las
  copias de `website/src/content/docs/referencia/`, que se generan al compilar.
- En tu primer PR, la CI espera a que una persona del equipo la apruebe antes de
  ejecutarse.

## Publicación

Las versiones las publica el equipo que mantiene el proyecto siguiendo
[el procedimiento de publicación](./docs/releasing.md). No cambies `version` en
los `package.json` dentro de un PR.
