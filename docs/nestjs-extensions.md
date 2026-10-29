# Integraciones componibles de NestJS

La CLI propuesta 1.11.0 y la plantilla NestJS 0.2.1 incorporan la capacidad
`extensions.nestjs`. Están pendientes de revisión y publicación; Community
1.10.0 no contiene este registro. Una extensión que lo use debe exigir
`requires.cli: ^1.11.0` y `requires.capabilities: [extensions.nestjs]`.

El manifiesto admite un bloque `integrations.nestjs`:

```json
{
  "modules": ["src/documents/documents.module:DocumentsModule"],
  "entities": ["src/documents/document.entity:Document"],
  "migrations": ["src/database/migrations/1800000000000-documents:Documents1800000000000"],
  "auditActions": [{
    "name": "document.shared",
    "metadata": ["name", "roles"],
    "stringListMetadata": ["roles"]
  }]
}
```

Las referencias son rutas dentro de `backend/src`, sin extensión .ts ni .js,
seguidas de dos puntos y el símbolo exportado. Sus archivos deben existir;
las migraciones también se declaran con su ruta .ts en `targets[].migrations`.
Cada extensión aporta archivos propios: no necesita sustituir AppModule,
el data source TypeORM, las entidades SQL.js ni el servicio de auditoría.
Las migraciones se ejecutan con `pnpm migration:run`; TypeORM ordena por el
timestamp de cada clase. Runtime PostgreSQL combina el registro con `forFeature`/autoLoadEntities;
el mismo registro aporta las entidades a la CLI de migraciones y a SQL.js.

La CLI produce tres registros independientes en `src/extensions`:
`modules.generated.ts`, `database.generated.ts` y `audit.generated.ts`.
Separarlos evita que el servicio de auditoría importe módulos que dependen de
él. No editar los archivos generados ni incluirlos como overlays.
Sin extensiones, los tres registros están vacíos y la aplicación sigue funcionando.

Se rechazan referencias duplicadas, fuentes inexistentes y acciones repetidas
entre extensiones durante la generación. Al arrancar también se rechaza
sobrescribir una acción de auditoría de Community. Los metadatos mantienen una
allowlist por acción: solo valores escalares finitos, null y listas de strings
en campos explícitamente declarados. Las listas no habilitan objetos anidados
ni campos desconocidos. No pasar payloads, credenciales o secretos al registro.

Las variables obligatorias se validan en proveedores del módulo. Los tests
deben establecer valores exclusivos de test con el entorno del proceso o un
setup propio, sin reemplazar archivos de test de la plantilla.
`supportedStacks` y `targets` siguen describiendo una variante concreta:
este registro no convierte los targets de un manifiesto en opcionales.
