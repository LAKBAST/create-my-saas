# Composable NestJS integrations

The proposed CLI 1.11.0 and NestJS template 0.2.1 add the `extensions.nestjs`
capability. They are pending review and release; Community 1.10.0 does not
contain this registry. An extension that uses it must require
`requires.cli: ^1.11.0` and `requires.capabilities: [extensions.nestjs]`.

The manifest accepts an `integrations.nestjs` block:

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

References are paths inside `backend/src`, without the .ts or .js extension,
followed by a colon and the exported symbol. Their files must exist; migrations
are also declared with their .ts path in `targets[].migrations`. Each extension
contributes its own files: it does not need to replace AppModule, the TypeORM
data source, the SQL.js entities or the audit service. Migrations run with
`pnpm migration:run`; TypeORM orders them by each class's timestamp. The
PostgreSQL runtime combines the registry with `forFeature`/autoLoadEntities;
the same registry provides the entities to the migrations CLI and to SQL.js.

The CLI produces three independent registries in `src/extensions`:
`modules.generated.ts`, `database.generated.ts` and `audit.generated.ts`.
Keeping them separate prevents the audit service from importing modules that
depend on it. Do not edit the generated files or include them as overlays.
Without extensions, the three registries are empty and the application keeps
working.

Duplicate references, missing sources and actions repeated across extensions
are rejected during generation. Overwriting a Community audit action is also
rejected at startup. Metadata keeps an allowlist per action: only finite
scalar values, null and string lists in explicitly declared fields. Lists do
not enable nested objects or unknown fields. Do not pass payloads, credentials
or secrets to the registry.

Required variables are validated in the module's providers. Tests must set
test-only values through the process environment or their own setup, without
replacing the template's test files. `supportedStacks` and `targets` still
describe a specific variant: this registry does not make a manifest's targets
optional.
