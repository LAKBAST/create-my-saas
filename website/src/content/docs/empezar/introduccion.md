---
title: Introducción
description: Qué es create-my-saas y qué obtienes al generar un proyecto.
---

`create-my-saas` es una CLI que genera la base de un producto SaaS a partir de
plantillas versionadas de backend y frontend. En lugar de reconstruir en cada
proyecto la autenticación, los usuarios, las organizaciones o la facturación,
eliges un backend y un frontend desde la terminal y obtienes un proyecto listo
para empezar a desarrollar.

## Qué incluye

La base común de las plantillas completas cubre:

- autenticación segura para navegador con sesiones y protección CSRF;
- usuarios, verificación de email y recuperación de cuenta;
- OAuth con Google y GitHub;
- organizaciones, invitaciones, roles y permisos (RBAC);
- audit log;
- Stripe Billing con Checkout, Portal y webhooks;
- un [panel de administración global](../../referencia/admin-dashboard/) en `/admin`;
- PostgreSQL con migraciones, límites de peticiones con Redis y una receta de
  despliegue con Docker Compose.

No todas las combinaciones incluyen todo: consulta
[las plantillas](../../guias/plantillas/) para ver qué cubre cada una.

## Principios

- **Sin cajas negras.** Cada plantilla es un proyecto autosuficiente. La CLI
  solo compone opciones compatibles, configura la conexión local entre capas y
  registra la selección en `.create-my-saas.json`.
- **Compatibilidad declarada.** Cada plantilla declara sus capacidades en un
  manifiesto. La CLI las compara antes de escribir un solo archivo y rechaza
  combinaciones que no funcionarían.
- **El código es tuyo.** El proyecto generado no hereda la licencia MIT: se
  crea como `UNLICENSED` y el aviso de las plantillas queda en
  `THIRD_PARTY_NOTICES.md`.
- **Fail-closed en producción.** En `staging` y `production` los backends
  exigen los servicios de los que dependen (PostgreSQL, Redis con TLS, correo)
  y se niegan a arrancar si faltan.

## Siguientes pasos

- [Instala los requisitos](../instalacion/).
- [Genera y arranca tu primer proyecto](../quick-start/) en unos minutos.
