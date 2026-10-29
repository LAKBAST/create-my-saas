# Visión y evolución de Community

El proyecto pretende ser la base para crear un SaaS mediante una decisión de
terminal, por ejemplo: elegir FastAPI, NestJS o un backend futuro; y elegir un
dashboard Next.js/React Router, un sitio Astro o un frontend futuro. Añadir una
opción debe consistir en crear una plantilla autosuficiente, declarar su
contrato de capacidades y ampliar las pruebas de compatibilidad, no en acoplar
los frameworks entre sí.

La base común buscada incluye autenticación segura para navegador, usuarios y
organizaciones, permisos, configuración de PostgreSQL y migraciones, límites de
peticiones, flujos de cuenta y una interfaz lista para empezar un producto.

## Líneas de trabajo

La prioridad es reducir el tiempo entre generar un proyecto y tener una aplicación
lista para desarrollar. El alcance implementado se consulta en estas guías:

- [Configuración local con setup y doctor, y datos de demostración con seed](./cli-usage.md).
- [Contrato API tipado y operaciones por capacidad](./api-contract.md).
- [Despliegue reproducible](./deployment.md).
- [Actualización de proyectos mediante .create-my-saas.json](./upgrading.md).

El roadmap original planteaba presets para proveedores y entornos de producción
comunes, además de informar de versiones disponibles y pasos de migración
compatibles. La receta de despliegue y el comando de actualización actuales se
describen en sus guías; esas aspiraciones no garantizan integraciones adicionales.

La experiencia debe validarse con proyectos generados y los trabajos de CI deben
terminar correctamente antes de publicar una release. Las demás mejoras se
abordarán según adopción y feedback de la comunidad. La disponibilidad en npm
depende de la versión publicada; consulta [cómo verificarla](./releasing.md#verificación-posterior).
