# Development and checks

```sh
npm run validate:templates
npm test
```

These checks validate the six manifests and the CLI, including the
compatibility rules, generation, the package contents and the exclusion of
local artifacts. Each starter's own checks live inside its directory.

The browser E2E test generates the project and runs the full flow against an
isolated PostgreSQL and Redis instance. The supported matrix is FastAPI and
NestJS with Next.js, React Router and Astro; Fastify with Astro; and Astro with
`billing` for FastAPI and NestJS. Select a matrix entry with `E2E_BACKEND`,
`E2E_FRONTEND` and, for the optional variant, `E2E_FEATURES`:

```powershell
$env:E2E_BACKEND = 'nestjs'
$env:E2E_FRONTEND = 'astro'
$env:E2E_FEATURES = 'billing'
pnpm test:e2e:browser
```

Each run checks sign-up, recovery and session. When the combination exposes
its proxies, it also checks organizations, invitations, permissions and the
billing status without Stripe. Astro without the `billing` feature exposes no
organization or billing routes; Fastify + Astro only covers the flows that
backend declares.

The product models workflow runs HTTP contracts for selected `individual` and
`mixed` combinations, in addition to the usual E2E tests with `teams` and
individual Fastify. It filters jobs by the modified backend and frontend to
avoid running templates unrelated to the change. Every release requires those
remote jobs to finish successfully.

See [the full release procedure](./releasing.md).

The npm distribution includes the CLI, the templates and the documentation,
and excludes dependencies and build output. Releases are done manually; before
publishing a new version, update `version` in `package.json`, run the local
checks and create the matching tag.
