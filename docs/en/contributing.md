# Contributing

Thanks for wanting to improve create-my-saas. The repository is public and
accepts contributions through pull requests against `main`: fork it, work on a
branch and open the PR from it. By contributing you agree that your code is
distributed under the project's [MIT license](../../LICENSE).

This repository is create-my-saas Community. create-my-saas Pro is a separate
commercial product, with additional modules available from the
[LAKBAST Store](https://tienda.lakbast.com/store); what you contribute here
stays MIT and is part of Community.

## Before you start

- **Bugs and proposals**: open an [issue](https://github.com/LAKBAST/create-my-saas/issues/new/choose)
  with the matching template. Check first whether a similar one already exists.
- **Large changes**: a new template, a new capability or a change to the HTTP
  contract need an issue first to agree on the approach before writing code.
- **Security**: do not disclose vulnerabilities in an issue. Use
  *Security → Report a vulnerability* in the repository to report privately.
- **Project direction**: the [Community vision](./project.md) explains what the
  project aims for and what is out of scope.

## What fits

- Fixes and improvements to the CLI (`packages/cli`), the templates
  (`templates/`), the extensions (`extensions/`) and the documentation (`docs/`).
- New templates, as long as they are self-contained: each one declares its
  manifest, its capabilities and its compatibility, and extends the tests. See
  [template manifests](./template-manifests.md).
- Behaviour changes that keep the templates equivalent. FastAPI defines the
  reference HTTP contract; if you change an endpoint, apply the change to the
  other affected backends and frontends and update
  [template parity](./template-parity.md) and
  [the API contract](./api-contract.md).

Secrets, real `.env` files, generated artifacts (`node_modules`, `dist`,
caches) and dependencies on private registries or services are not accepted.
CI checks this with `npm run audit:public`.

## Setting up your environment

1. Fork the repository and clone it.
2. Install Node.js 24. The root checks do not need any dependencies installed.
3. To work on a template, follow the README in its folder: each starter has its
   own dependencies, package manager and checks.

## Checks before the PR

From the root, the same checks CI always runs:

```sh
npm run audit:public
npm run validate:templates
npm test
```

On Windows, two tests that create symbolic links may fail with `EPERM` if your
user is not allowed to create them; they pass on Linux and in CI.

If you touch a template, also run the checks in its README. The E2E tests for
generated projects are described in [development and checks](./development.md);
CI runs them only for the templates affected by the change.

## Branches, commits and pull requests

- Create the branch from `main` with a prefix that states the type:
  `fix/`, `feat/`, `docs/` or `chore/`.
- Write commits in Spanish with a
  [Conventional Commits](https://www.conventionalcommits.org/) prefix and an
  imperative description, for example `fix: Corregir la recuperación de
  contraseña en Astro`. Explain the reason for the change in the body.
- A PR solves one thing only. Fill in the PR template: what changes, why and
  how you tested it.
- If the change is visible to people using the CLI or the generated projects,
  add an entry under `[Unreleased]` in [`CHANGELOG.md`](../../CHANGELOG.md).
- The website documentation comes from `docs/`. Always edit `docs/*.md` and
  its English translation in `docs/en/*.md`, never the copies in
  `website/src/content/docs/`, which are generated at build time. The website
  does not build if any page is missing its translation.
- On your first PR, CI waits for a team member to approve it before running.

## Releases

Versions are published by the maintainers following
[the release procedure](./releasing.md). Do not change `version` in the
`package.json` files within a PR.
