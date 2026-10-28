# Contrato API tipado de Community

`templates/shared/api-contract.ts` es la fuente de los tipos públicos de
autenticación, usuarios, espacios, organizaciones, facturación y administración.
Las tres plantillas frontend incluyen una copia idéntica para que también
puedan compilarse por separado; `packages/cli/test/api-contract.test.js`
impide que diverjan. Al cambiar el contrato, actualiza las tres copias.

El contrato distingue las formas recibidas por HTTP (`UserWire` y
`AuthenticationWire`) de las formas normalizadas que usan las páginas (`User` y
`Authentication`). Los clientes aceptan `snake_case` y `camelCase` para los
campos de usuario y token. Las diferencias de rutas de billing entre FastAPI y
NestJS siguen resueltas por los adaptadores existentes.

`CoreApi` describe las operaciones presentes en los tres backends.
`OrganizationApi`, `BillingApi` y `AdminApi` son capacidades opcionales:
Fastify ofrece solo el modelo individual y no expone esas rutas. Astro sin la
extensión de billing tampoco muestra flujos de organización o facturación.
La selección real de capacidades permanece en el manifiesto de las plantillas
y en el contexto de `/workspaces/bootstrap`.

Las pruebas HTTP de proyectos generados verifican los contratos de backend y
frontend en las combinaciones afectadas. TypeScript comprueba las tres
plantillas frontend; las respuestas externas siguen siendo datos no fiables y
los adaptadores validan o normalizan los campos que usan antes de mostrarlos.
