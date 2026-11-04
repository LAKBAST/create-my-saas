# Releasing the CLI

The npm package is called `@lakbast/create-my-saas`. Up to `1.16.0` it was
published as `@soymanolo/create-my-saas`, which is now deprecated; `upgrade`
still downloads the older versions from there. The
`.github/workflows/publish.yml` workflow is triggered by pushing a `v*` tag. It
validates the version, runs the CLI checks, inspects the npm contents,
publishes the package and creates the GitHub Release with notes generated from
its changelog section. The exception is the bootstrap tag `v1.17.0`, detailed
below.

## One-time setup before the first release

1. Sign in to npm with an account that owns the `lakbast` organization and
   enable 2FA.
2. Create the public package `@lakbast/create-my-saas` through the first
   manual publish. npm requires the package to exist before a trust
   relationship can be configured. Do not use the npm token in the repository
   or in GitHub Actions.
3. In npm, open **Packages → @lakbast/create-my-saas → Settings → Trusted
   Publisher** and register GitHub Actions with these values:

   | Field | Value |
   | --- | --- |
   | Organization or user | `LAKBAST` |
   | Repository | `create-my-saas` |
   | Workflow | `publish.yml` |
   | Environment | leave empty |
   | Allowed action | `npm publish` |

   This relationship uses short-lived OIDC credentials. The workflow needs
   `id-token: write` to request them, but stores no npm credentials.

4. Check that the `@lakbast` scoped package is public. The workflow runs
   `npm publish` without `--access public`; it does not turn a private package
   into a public one.

The following procedure is the bootstrap for `1.17.0`, the first version under
the `@lakbast` scope, and must not be repeated for an already published
version. The first manual publish of the scoped package is done from the root
of a clean checkout of that version:

```sh
npm login
npm publish --access public
```

Do not copy the npm token into this repository, GitHub secrets or a chat.
After that initial publish, configure the trusted publisher and create the
`v1.17.0` tag. The workflow confirms that `1.17.0` already exists on npm and
creates the GitHub Release without publishing again. From then on, releases
are automatic. Finally, deprecate the old package:

```sh
npm deprecate @soymanolo/create-my-saas "Movido a @lakbast/create-my-saas"
```

## Creating a release

Only publish a new version if the public extension contract changes or there
are real improvements to the public templates. Do not publish a version for
internal changes that do not affect those two areas.

1. Choose a new SemVer version, update `version` in `package.json` and
   `packages/cli/package.json`, and add its section to `CHANGELOG.md`. The
   workflow will use that section's content as the GitHub Release
   description.
2. Run the same checks locally:

   ```sh
   pnpm install --frozen-lockfile
   pnpm run validate:templates
   pnpm test
   npm pack --dry-run
   ```

3. Merge the version change into `main` and create the annotated tag with that
   same version:

   ```sh
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   ```

4. The **Publish CLI** workflow checks that `X.Y.Z` exactly matches
   `package.json`. If the checks pass, it publishes `@lakbast/create-my-saas`
   with the `latest` tag and creates the `vX.Y.Z` GitHub Release.

Do not reuse or move published tags: npm does not allow replacing an existing
version. To fix a release, publish a new SemVer version.

## Post-release verification

Check the published version and install the CLI without using the checkout:

```sh
npm view @lakbast/create-my-saas version
npx @lakbast/create-my-saas@latest example-saas --backend nestjs --frontend nextjs
```

The effective Trusted Publishing configuration and the package provenance are
checked on npm and in the publish output; the workflow code alone does not
confirm that this external relationship is configured.
