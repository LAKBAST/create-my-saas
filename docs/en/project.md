# Community vision and roadmap

The project aims to be the foundation for building a SaaS from a single
terminal decision, for example: choosing FastAPI, NestJS or a future backend;
and choosing a Next.js/React Router dashboard, an Astro site or a future
frontend. Adding an option should mean creating a self-contained template,
declaring its capability contract and extending the compatibility tests, not
coupling the frameworks to each other.

The intended common base includes secure browser authentication, users and
organizations, permissions, PostgreSQL configuration and migrations, rate
limiting, account flows and an interface ready to start a product.

## Lines of work

The priority is to shorten the time between generating a project and having an
application ready for development. The implemented scope is described in these
guides:

- [Local configuration with setup and doctor, and demo data with seed](./cli-usage.md).
- [Typed API contract and operations by capability](./api-contract.md).
- [Reproducible deployment](./deployment.md).
- [Upgrading projects through .create-my-saas.json](./upgrading.md).

The original roadmap proposed presets for common production providers and
environments, as well as reporting available versions and compatible migration
steps. The current deployment recipe and upgrade command are described in their
guides; those aspirations do not guarantee additional integrations.

The experience must be validated with generated projects, and CI jobs must
finish successfully before publishing a release. Other improvements will be
addressed according to community adoption and feedback. Availability on npm
depends on the published version; see [how to verify it](./releasing.md#post-release-verification).
