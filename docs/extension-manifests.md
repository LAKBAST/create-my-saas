# Manifiestos de extensiones

Las extensiones son overlays declarativos y versionados que se instalan al
seleccionarlos con `--feature`. Pueden residir en `extensions/` del paquete o
en directorios locales indicados con `--extensions-dir`. La CLI recorre esos
directorios de forma recursiva; no descarga extensiones ni ejecuta comandos
declarados por ellas.

Desde un checkout del repositorio:

```sh
node packages/cli/bin/create-my-saas.js app --backend fastapi --frontend nextjs \
  --extensions-dir ./mis-extensiones --feature acme:reports
```

Los flags `--extensions-dir` y `--feature` son repetibles. Los IDs tienen la
forma `namespace:name`, como `acme:reports`; elige un namespace propio. El campo
opcional `aliases` permite selectores cortos, únicos en el catálogo. La extensión
incluida es `community:astro-billing` (`1.0.0`), con alias `billing`: añade
facturación a Astro y admite FastAPI o NestJS como backend. Los IDs y versiones
de las plantillas se detallan en [su guía](./template-manifests.md).

## Estructura

Cada extensión contiene `extension.manifest.json` y los archivos declarados:

```text
mis-extensiones/
  reports/
    extension.manifest.json
    overlays/
      backend/
        src/modules/reports/router.py
        alembic/versions/001_reports.py
```

El manifiesto debe cumplir
[`extension-manifest.schema.json`](./extension-manifest.schema.json).
`schemaVersion` es independiente de `version`; el formato actual es `1`.
El siguiente ejemplo ilustra los metadatos; los archivos del overlay deben
implementar realmente las capacidades declaradas:

```json
{
  "$schema": "https://create-my-saas.dev/schemas/extension-manifest-v1.json",
  "schemaVersion": 1,
  "id": "acme:reports",
  "version": "1.0.0",
  "displayName": "Informes",
  "description": "Añade endpoints de informes.",
  "provides": ["reports.api"],
  "requires": {
    "cli": "^1.0.0",
    "capabilities": ["auth.password"],
    "extensions": []
  },
  "supportedStacks": [
    { "backend": { "id": "backend:fastapi", "version": "^0.1.0" } }
  ],
  "targets": [
    {
      "template": "backend:fastapi",
      "overlay": "overlays/backend",
      "replace": [],
      "environment": [],
      "migrations": ["alembic/versions/001_reports.py"]
    }
  ]
}
```

## Compatibilidad y dependencias

`requires.cli` y las versiones requeridas en `supportedStacks` y
`requires.extensions` aceptan una versión exacta `X.Y.Z` o un rango `^X.Y.Z`.
La CLI comprueba que coincida al menos una entrada de `supportedStacks`, que
estén disponibles todas las capacidades requeridas y que las dependencias
seleccionadas tengan versiones compatibles antes de escribir el proyecto.
Un componente omitido en una entrada de `supportedStacks` no restringe ese lado
de la combinación.

Declara las dependencias como objetos `{ "id": "acme:base", "version": "^1.0.0" }`
en `requires.extensions`. Las dependencias disponibles en los directorios del
catálogo se seleccionan automáticamente y se ordenan antes de la extensión
dependiente; se rechazan las ausentes, incompatibles o cíclicas.

`provides` añade capacidades en ese orden. `conflictsWith` declara IDs de
extensiones que no pueden coexistir. `apiPrefixes` permite declarar nuevos
prefijos HTTP que la CLI añade a la configuración del gateway generado.

## Puntos de integración

`integrations.fastapi` registra imports de routers, ajustes de entorno con
longitud mínima y acciones de auditoría permitidas. La CLI combina las entradas
en el registro de integración de la base, sin reemplazar `main.py`, el módulo de
configuración ni el servicio de auditoría. `integrations.frontendRoutes` registra
rutas de Next.js en `app/extensions.generated.ts`; los componentes se añaden
como archivos normales del overlay.

Este fragmento se añade como propiedad `integrations` del manifiesto:

```json
{
  "integrations": {
    "fastapi": {
      "routers": ["src.modules.reports.router:router"],
      "settings": [{ "name": "REPORTS_TOKEN", "default": "", "minLength": 32 }],
      "auditActions": [{ "name": "reports.exported", "metadata": ["format"] }]
    },
    "frontendRoutes": ["/settings/reports"]
  }
}
```

## Overlays y migraciones

Los overlays se copian después de la plantilla base. Se admiten archivos nuevos;
para sustituir uno existente, declara su ruta relativa en `replace`. Dos
extensiones seleccionadas no pueden escribir la misma ruta. Las rutas deben
permanecer dentro de la extensión y los overlays no admiten enlaces simbólicos.

Declara cada migración en `migrations`, con ruta relativa al overlay. La CLI
copia esos archivos pero no los ejecuta. Si cambian las dependencias, el overlay
debe aportar el manifiesto del gestor de paquetes y su lockfile, con los
reemplazos correspondientes en `replace`; la CLI no los modifica por heurísticas.

## Variables de entorno

`targets[].environment` afecta solo al target: las variables de backend van a
`backend/.env.example` y las de frontend a `frontend/.env.example`. El validador
actual exige el prefijo `NEXT_PUBLIC_` para cualquier target frontend, incluido
Astro; no adapta ese prefijo al framework. No incluyas secretos en variables
públicas.

Usa `deploymentEnvironment`, en la raíz del manifiesto, para valores destinados
a `deployment/.env.production.example`. Cada entrada de entorno contiene `name`,
`value`, `secret` y `description`; si `secret` es `true`, `value` debe estar vacío.
Las declaraciones idénticas de varias extensiones se emiten una vez y las
declaraciones incompatibles se rechazan.

Desde la raíz, ejecuta `npm run validate:extensions` y prueba cada combinación
declarada generando un proyecto temporal con la extensión seleccionada. Aplica
las migraciones con las herramientas del backend, según la
[guía de despliegue](./deployment.md).
