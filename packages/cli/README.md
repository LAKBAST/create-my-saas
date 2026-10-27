# create-my-saas CLI

Generates a project by discovering the individual `template.manifest.json` files
in the `templates` directory.

Extensions are versioned overlays with their own manifests. Select one with
repeatable `--feature <id>` flags; the generator validates the complete stack
before writing files. Discover extensions stored outside the package with a
repeatable `--extensions-dir <path>` flag. The CLI only reads the directories
you provide; it never downloads extensions or executes commands from them.

From this repository, run:

```sh
node packages/cli/bin/create-my-saas.js my-saas --backend nestjs --frontend nextjs
```

Use `--list` to inspect available templates. Select either side independently:

```sh
node packages/cli/bin/create-my-saas.js api-only --backend fastapi
```

The command refuses to use an existing destination directory and writes
`.create-my-saas.json` with the selected template IDs and versions. Local build
and dependency artifacts are deliberately excluded from generated projects.

Prepare a generated project's local configuration with `create-my-saas setup
<project>`. It creates ignored `.env` files for the selected layers and local
Compose, generates a development secret, and preserves existing files. Run
`create-my-saas doctor <project> --no-services` to validate configuration,
then start local PostgreSQL and Redis and run `doctor` again to check TCP
reachability. A TCP check does not verify credentials or migrations; use the
backend's `/ready` endpoint for runtime readiness. Do not copy the production
example over the local `deployment/.env` created by setup.
