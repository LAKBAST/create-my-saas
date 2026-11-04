# Upgrading a generated project

From the project folder, with the git repository free of pending changes:

```sh
npx @lakbast/create-my-saas@latest upgrade --dry-run   # what would change
npx @lakbast/create-my-saas@latest upgrade
```

The CLI regenerates the project with the version it comes from (downloading it
from npm) and with the current one, and compares each file with your copy:

- if you have not touched it, it is replaced by the one from the new version;
- if you changed it and so did the template, both versions are merged; when
  they clash, `<<<<<<<` markers are left for you to resolve (and the command
  exits with code 2);
- new template files are added, and files the template removes are deleted
  only if you have not modified them;
- your own files are not touched.

The summary shows which versions the CLI, templates and modules move from and
to, and what you need to do afterwards based on the incoming files: install
dependencies, review new variables in `.env.example` and apply migrations.
`--dry-run` shows the same without writing anything.

Review the result with `git diff` and commit. Projects created before
`.create-my-saas.json` stored the CLI version need to state it once with
`--from <version>`. Paths listed under `unmanaged` in that file are never
updated, for anything you have heavily customized. If you used extensions from
a local folder (for example, Pro), pass `--extensions-dir` again.

## Adding or updating Pro modules

With an active Pro license, you can check your licenses and install a module
straight from the store, without downloading or extracting files by hand:

```sh
create-my-saas pro list
create-my-saas pro add admin-dashboard
create-my-saas pro add pro:admin-dashboard ./my-saas --version 2.2.0 --dry-run
```

The CLI uses `CREATE_MY_SAAS_TOKEN` or, as a one-off, `--token <token>`. The
token is only sent in the request header; it is not stored in the project. The
default store is `https://tienda.lakbast.com`; you can configure another one
with `CREATE_MY_SAAS_STORE_URL`. `pro add` uses the recommended version
compatible with the project's Community version, unless you pass `--version`.
`--dry-run` shows the license, version, feature and command without
downloading the module. Like `upgrade`, `pro add` requires the project to be in
git with no pending changes, and checks this before downloading;
`--allow-dirty` skips the check.

Pro modules are delivered as local folders and can also be added or have their
version changed in an already generated project. The merge is the same: the
base is generated with the modules the project has now and the new version
with the ones you want to have, so your changes are kept.

To add a module, pass its ID with `--feature` (repeatable) and its folder with
`--extensions-dir`:

```sh
npx @lakbast/create-my-saas upgrade --feature object-storage-nestjs --extensions-dir ./pro-object-storage-1.2.0
```

Its files show up as added, and the generated registries (for example
`src/extensions/*.generated.ts` in NestJS) and the `.env.example` files are
merged with yours. If the project already uses other Pro modules, also pass
their folders with `--extensions-dir`.

To change a module's version, pass the folder of the version the project has
with `--base-extensions-dir` and the folder of the new version with
`--extensions-dir` (both repeatable):

```sh
npx @lakbast/create-my-saas upgrade --base-extensions-dir ./pro-object-storage-1.1.0 --extensions-dir ./pro-object-storage-1.2.0
```

Without `--base-extensions-dir`, the `--extensions-dir` folders are used for
both generations, as before. Before generating anything, the CLI compares the
folder versions with the ones stored in `.create-my-saas.json` and stops if
they do not match, with a message such as «El proyecto usa
pro:object-storage-nestjs@1.1.0; pasa su carpeta con --base-extensions-dir.»
(“The project uses pro:object-storage-nestjs@1.1.0; pass its folder with
--base-extensions-dir.”). That way a diff is never computed against the wrong
version.

If the CLI version does not change, only the modules are updated: the base is
generated with the CLI itself, without downloading anything. If the CLI is
newer too, both changes arrive together. Both options can be combined with
`--dry-run` and `--allow-dirty`, and the summary lists the modules that change,
for example `Módulos: + pro:x@1.2.0, pro:y 1.1.0 → 1.2.0`.

See also [product models](./product-models.md) and [the extension contract](./extension-manifests.md).

## Next.js: public landing page and dashboard at /app

In the new Next.js template, `/` is public and the previous dashboard lives at `/app`. Review links, bookmarks, tests and custom redirects. To keep the previous behaviour, replace `app/page.tsx` with the protected dashboard from `app/app/page.tsx`, adjust its imports to the root directory and change the navigation and the default post-login destination from `/app` to `/`. Keep a copy of your changes before running upgrade and resolve any conflicts manually.
