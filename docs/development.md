# Desarrollo y comprobaciones

```sh
npm run validate:templates
npm test
```

Estas comprobaciones validan los seis manifiestos y la CLI, incluidas las reglas
de compatibilidad, la generación, el contenido del paquete y la exclusión de
artefactos locales. Las verificaciones de cada starter viven dentro de su
propio directorio.

El E2E de navegador genera el proyecto y ejecuta el flujo completo contra una
instancia aislada de PostgreSQL y Redis. La matriz compatible es FastAPI y
NestJS con Next.js, React Router y Astro; Fastify con Astro; y Astro con
`billing` para FastAPI y NestJS. Selecciona una entrada de la matriz mediante
`E2E_BACKEND`, `E2E_FRONTEND` y, para la variante opcional, `E2E_FEATURES`:

```powershell
$env:E2E_BACKEND = 'nestjs'
$env:E2E_FRONTEND = 'astro'
$env:E2E_FEATURES = 'billing'
pnpm test:e2e:browser
```

Cada ejecución comprueba registro, recuperación y sesión. Cuando la
combinación expone sus proxies, también comprueba organizaciones, invitaciones,
permisos y el estado de billing sin Stripe. Astro sin la feature `billing` no
expone rutas de organizaciones ni facturación; Fastify + Astro cubre sólo los
flujos que declara ese backend.

El workflow de modelos ejecuta contratos HTTP para combinaciones seleccionadas
de `individual` y `mixed`, además de los E2E habituales con `teams` y Fastify
individual. Filtra los trabajos por backend y frontend modificados para evitar
ejecutar plantillas ajenas al cambio. Cada publicación requiere que esos
trabajos remotos terminen correctamente.

Consulta [el procedimiento completo de publicación](./releasing.md).

La distribución de npm incluye la CLI, las plantillas y la documentación, y
excluye dependencias y compilados. Las publicaciones se realizan manualmente;
antes de publicar una nueva versión, actualiza `version` en `package.json`,
ejecuta las comprobaciones locales y crea el tag correspondiente.
