---
title: Installation
description: Requirements for using the CLI and running the generated projects.
---

The CLI does not need to be installed: it runs with `npx`, which downloads the
latest version published on npm.

```sh
npx @lakbast/create-my-saas@latest --help
```

## Requirements

| Tool | What for | Version |
| --- | --- | --- |
| [Node.js](https://nodejs.org/) | Running the CLI and the TypeScript templates | 20 or later |
| [Docker](https://docs.docker.com/get-docker/) with Compose | Local PostgreSQL and Redis, and the deployment recipe | Compose v2 |
| [Git](https://git-scm.com/) | Versioning the project and using `upgrade` | Any recent version |

If you choose the **FastAPI** backend you will also need Python and the tools
listed in the `README.md` of `backend/` in the generated project.

## Checking the catalog

To see the templates and extensions available in the version you are going to
use:

```sh
npx @lakbast/create-my-saas@latest --list
```

## Global installation (optional)

If you prefer to have the command always available:

```sh
npm install --global @lakbast/create-my-saas
create-my-saas --help
```

With a global installation you have to keep it updated yourself; with
`npx …@latest` you always use the latest version.

## Next step

[Generate your first project](../quick-start/).
