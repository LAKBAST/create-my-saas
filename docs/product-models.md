# Modelos de producto

Community permite elegir cómo usa el cliente un SaaS. Esta capacidad pertenece
a la base de autenticación, aislamiento y facturación de un solo producto; no es
el catálogo multiproducto ni la gestión de varias suscripciones independientes
que corresponden a Pro.

## Selección

Con la CLI del repositorio (comandos desde su raíz):

```sh
node packages/cli/bin/create-my-saas.js personal --backend fastapi --frontend nextjs --product-model individual
node packages/cli/bin/create-my-saas.js equipos --backend nestjs --frontend react-router --product-model teams
node packages/cli/bin/create-my-saas.js mixto --backend nestjs --frontend astro --feature billing --product-model mixed
```

| Modelo | Registro y uso | Facturación |
| --- | --- | --- |
| `individual` | Cuenta y espacio personal automático, sin crear una organización manualmente | Suscripción del espacio personal |
| `teams` | Organizaciones creadas explícitamente, miembros, invitaciones y roles | Una suscripción por organización |
| `mixed` | Espacio personal automático y posibilidad de crear equipos | La suscripción personal y las de cada equipo son independientes |

FastAPI y NestJS soportan los tres modelos y conservan `teams` por defecto para
los proyectos que no seleccionan uno. Fastify soporta únicamente `individual`,
sin organizaciones ni facturación. Las combinaciones de plantillas siguen
sujetas a sus capacidades: elegir `individual` no añade Stripe a Fastify.
Fastify se combina con Astro; Next.js y React Router requieren organizaciones
y Stripe incluso al seleccionar `individual`. Consulta el
[catálogo y la compatibilidad](./template-manifests.md).
La selección explícita requiere un backend; un sitio Astro público sin API no
necesita un modelo de cuentas.

En proyectos con backend, la CLI guarda `productModel` en `.create-my-saas.json`
con esquema 4 y escribe `PRODUCT_MODEL` en los ejemplos de entorno del backend
y de despliegue. Copia
ese valor a la configuración real del servicio. Los frontends descubren el
modelo desde la API, evitando una segunda configuración que pueda contradecirla.
La interfaz de facturación de Astro se añade con `--feature billing`; su modo
base sigue ofreciendo únicamente el área autenticada ligera.

## Espacio personal interno

Un espacio personal reutiliza las organizaciones como límite interno de datos
y facturación, pero tiene un propietario personal exclusivo, protegido por una
restricción única en la base de datos. El cliente individual no realiza un paso
manual de creación de empresa ni necesita gestionar miembros.

No se permite invitar a otros usuarios, compartir o transferir un espacio
personal. Las comprobaciones se hacen en el backend; ocultar los controles de
la interfaz no constituye la protección. En modo individual tampoco se permite
crear equipos mediante una petición directa a la API.

Los registros nuevos de contraseña y OAuth preparan el espacio personal cuando
corresponde. `POST /workspaces/bootstrap`, autenticado, permite inicializar el
contexto de una cuenta existente de forma idempotente.
Las peticiones incluyen el Bearer de sesión y, con FastAPI, la cabecera CSRF
tomada de la cookie de la sesión, como hacen los clientes incluidos.
Su contrato es:

```json
{
  "model": "mixed",
  "personalWorkspace": { "id": "uuid", "name": "Personal", "slug": "personal-uuid" },
  "teams": [],
  "billingSupported": true
}
```

En `teams`, `personalWorkspace` es `null`; en Fastify también es `null` porque
la identidad del usuario ya es el ámbito personal y `billingSupported` es
`false`. Las interfaces mantienen un fallback al flujo anterior si un backend
antiguo no implementa el endpoint.

## Suscripciones y cambios de modelo

En modo mixto, seleccionar el contexto personal o un equipo cambia qué
suscripción se consulta y gestiona. Crear un equipo no convierte, copia ni
traslada la suscripción personal y no inicia un segundo cobro automáticamente.
Cada contratación requiere su propio Checkout explícito.

Para desactivar una cuenta con una suscripción personal de Stripe renovable,
primero hay que cancelar su renovación mediante el portal de facturación. La
API responde `409 ACTIVE_PERSONAL_SUBSCRIPTION` si la suscripción sigue renovando;
las cuentas gratuitas y las suscripciones con cancelación programada pueden
desactivarse si cumplen las demás comprobaciones. Ser el último propietario
activo de un equipo también bloquea la baja con `409 LAST_ACTIVE_OWNER`:
transfiere antes su propiedad a otro miembro activo. La baja de cuenta no
cancela suscripciones automáticamente.

Las migraciones conservan las organizaciones existentes como equipos. No
reasignan sus datos, miembros ni suscripciones. Cambiar `PRODUCT_MODEL` no es
una herramienta de migración de clientes o de suscripciones; revisa esos cambios
operativos expresamente y conserva los datos existentes.

El upgrade conserva el modelo registrado en el esquema 4. Los manifiestos
antiguos se siguen admitiendo: los proyectos completos mantienen su flujo de
equipos y Fastify su alcance individual. Actualiza y aplica las migraciones antes
de servir una versión que utilice espacios personales.
