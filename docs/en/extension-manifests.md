# Extension manifests

Extensions are declarative, versioned overlays that are installed when you
select them with `--feature`. They can live in the package's `extensions/` or in
local directories passed with `--extensions-dir`. The CLI walks those
directories recursively; it does not download extensions or run commands they
declare.

From a repository checkout:

```sh
node packages/cli/bin/create-my-saas.js app --backend fastapi --frontend nextjs \
  --extensions-dir ./my-extensions --feature acme:reports
```

The `--extensions-dir` and `--feature` flags are repeatable. IDs have the form
`namespace:name`, such as `acme:reports`; choose your own namespace. The
optional `aliases` field allows short selectors, unique within the catalog.
The bundled extension is `community:astro-billing` (`1.0.0`), with the alias
`billing`: it adds billing to Astro and supports FastAPI or NestJS as the
backend. Template IDs and versions are detailed in
[their guide](./template-manifests.md).

`.create-my-saas.json` stores the ID and `version` of each installed extension.
`create-my-saas upgrade` uses that data to add extensions to an existing
project with `--feature` or change their version with `--base-extensions-dir`;
see [the upgrade guide](./upgrading.md#adding-or-updating-pro-modules).
Publish each version of an extension in its own folder so both versions can be
passed at the same time.

## Structure

Each extension contains `extension.manifest.json` and the declared files:

```text
my-extensions/
  reports/
    extension.manifest.json
    overlays/
      backend/
        src/modules/reports/router.py
        alembic/versions/001_reports.py
```

The manifest must conform to
[`extension-manifest.schema.json`](../extension-manifest.schema.json).
`schemaVersion` is independent of `version`; the current format is `1`. The
following example illustrates the metadata; the overlay files must actually
implement the declared capabilities:

```json
{
  "$schema": "https://create-my-saas.dev/schemas/extension-manifest-v1.json",
  "schemaVersion": 1,
  "id": "acme:reports",
  "version": "1.0.0",
  "displayName": "Reports",
  "description": "Adds reporting endpoints.",
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

## Compatibility and dependencies

`requires.cli` and the versions required in `supportedStacks` and
`requires.extensions` accept an exact version `X.Y.Z` or a range `^X.Y.Z`.
Before writing the project, the CLI checks that at least one `supportedStacks`
entry matches, that every required capability is available and that the
selected dependencies have compatible versions. A component omitted from a
`supportedStacks` entry does not restrict that side of the combination.

Declare dependencies as `{ "id": "acme:base", "version": "^1.0.0" }` objects in
`requires.extensions`. Dependencies available in the catalog directories are
selected automatically and ordered before the dependent extension; missing,
incompatible or cyclic ones are rejected.

`provides` adds capabilities in that order. `conflictsWith` declares the IDs
of extensions that cannot coexist. `apiPrefixes` declares new HTTP prefixes
that the CLI adds to the generated gateway configuration.

## Integration points

`integrations.fastapi.invitationHooks` and `integrations.nestjs.invitationHooks`
accept `path:function` references to invitation checks. Each function receives
`(action, db/manager, organization_id, email, user_id)`, where `action` is
`create` or `accept`. They run inside the Community transaction, after locking
the organization row and before creating or accepting the invitation. They can
throw an error to reject the operation. Without registered hooks, no lock or
query is added. Hooks should avoid external side effects until the transaction
commits.

`integrations.fastapi` registers router imports, environment settings with a
minimum length and allowed audit actions. The CLI combines the entries into the
base integration registry, without replacing `main.py`, the configuration
module or the audit service. `integrations.frontendRoutes` registers Next.js
routes in `app/extensions.generated.ts`; components are added as regular
overlay files.

This fragment is added as the manifest's `integrations` property:

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

## Overlays and migrations

Overlays are copied after the base template. New files are allowed; to replace
an existing one, declare its relative path in `replace`. Two selected
extensions cannot write the same path. Paths must stay inside the extension and
overlays do not allow symbolic links.

Declare each migration in `migrations`, with a path relative to the overlay.
The CLI copies those files but does not run them. If the dependencies change,
the overlay must provide the package manager manifest and its lockfile, with
the matching entries in `replace`; the CLI does not modify them heuristically.

## Environment variables

`targets[].environment` only affects its target: backend variables go to
`backend/.env.example` and frontend ones to `frontend/.env.example`. The
current validator requires the `NEXT_PUBLIC_` prefix for any frontend target,
including Astro; it does not adapt that prefix to the framework. Do not put
secrets in public variables.

Use `deploymentEnvironment`, at the root of the manifest, for values meant for
`deployment/.env.production.example`. Each environment entry contains `name`,
`value`, `secret` and `description`; if `secret` is `true`, `value` must be
empty. Identical declarations from several extensions are emitted once and
incompatible declarations are rejected.

From the root, run `npm run validate:extensions` and test each declared
combination by generating a temporary project with the extension selected.
Apply the migrations with the backend's tools, following the
[deployment guide](./deployment.md).
