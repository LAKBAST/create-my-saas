# create-my-saas

`create-my-saas` es un proyecto de [LAKBAST](https://lakbast.com) para arrancar
productos SaaS con un backend y/o un frontend versionados, elegidos desde la
terminal. La CLI combina plantillas compatibles, configura su conexión local y
registra la selección; cada starter sigue siendo independiente y sustituible.

**[Documentación web →](https://createmysaas.dev/)**

## Instalación y uso

Requiere Node.js 20 o posterior. Ejecuta la versión publicada en
[npm](https://www.npmjs.com/package/@lakbast/create-my-saas):

```sh
npx @lakbast/create-my-saas@latest my-saas --backend nestjs --frontend nextjs
```

Continúa con [la configuración local, los datos demo y los ejemplos de uso](docs/cli-usage.md)
y [la guía de despliegue](docs/deployment.md).

## Plantillas

| Capa | Opción | Propósito |
| --- | --- | --- |
| Backend | `fastapi` | API Python con autenticación, organizaciones y Stripe. |
| Backend | `nestjs` | API TypeScript modular con el mismo contrato funcional. |
| Backend | `fastify` | API TypeScript ligera con autenticación, sin organizaciones ni billing. |
| Frontend | `nextjs` | Dashboard con rutas protegidas y flujos de cuenta. |
| Frontend | `react-router` | Dashboard React con SSR/Framework Mode. |
| Frontend | `astro` | Marketing, documentación y blog con área privada ligera. |

La CLI valida las capacidades antes de escribir archivos: FastAPI y NestJS se
combinan con los tres frontends; Fastify solo con Astro. Next.js y React Router
requieren organizaciones y Stripe; Astro añade billing con `--feature billing`
y FastAPI o NestJS. También puedes generar una sola capa. Consulta
[el catálogo y las reglas de compatibilidad](docs/template-manifests.md).

## Guías de referencia

- [Modelos individual, equipos y mixto](docs/product-models.md) y [administración global](docs/admin-dashboard.md).
- [Actualización de proyectos generados](docs/upgrading.md).
- [Contrato API](docs/api-contract.md) y [equivalencia de plantillas](docs/template-parity.md).
- [Extensiones y features](docs/extension-manifests.md).
- [Publicación de la CLI](docs/releasing.md) y [visión del proyecto](docs/project.md).

## Desarrollo local de la CLI

Desde la raíz del checkout:

```sh
node packages/cli/bin/create-my-saas.js my-saas --backend nestjs --frontend nextjs
npm run validate:templates
npm test
```

Estas comprobaciones validan los manifiestos y la CLI. Consulta
[la guía de desarrollo](docs/development.md) para las pruebas de cada starter,
la matriz E2E y los requisitos de publicación.

## create-my-saas Pro

Community es gratuito y completo con licencia MIT. create-my-saas Pro añade
siete módulos comerciales de producción (claves API, tareas en segundo plano,
facturación por uso, almacenamiento de archivos, observabilidad, consola de
administración y commerce) y soporte prioritario, con una única suscripción
desde 29 € al mes, IVA incluido. Detalles en
[createmysaas.dev/pro](https://createmysaas.dev/pro/); se contrata en la
[Tienda LAKBAST](https://tienda.lakbast.com/store).

## Contribuir

Las contribuciones llegan como pull requests contra `main`. Antes de abrir uno,
lee [la guía de contribución](CONTRIBUTING.md): qué encaja, qué comprobaciones
pasar y cómo escribir los commits.

## Licencia

La CLI y las plantillas se distribuyen bajo [licencia MIT](LICENSE). Puedes usar,
modificar y distribuir los proyectos generados, también como productos comerciales
o propietarios, conservando el aviso de copyright y la licencia de las partes
procedentes de las plantillas; las dependencias mantienen sus propias licencias.

El proyecto generado es tuyo: no se crea un `LICENSE`, se declara
`"license": "UNLICENSED"` (`LicenseRef-Proprietary` en FastAPI) y se conserva el
aviso MIT en `THIRD_PARTY_NOTICES.md`. Añade tu propio `LICENSE` si lo publicas
con otras condiciones.
