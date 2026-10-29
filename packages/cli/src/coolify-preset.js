import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function environmentEntries(example, productModel, hasFrontend) {
  const values = new Map([...example.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map(([, key, value]) => [key, value]));
  const fixed = new Map([
    ['APP_ENV', 'production'], ['PORT', '8000'], ['DATABASE_SSL', 'true'],
    ['COOKIE_SECURE', 'true'], ['TRUST_PROXY_HEADERS', hasFrontend ? 'true' : 'false'],
    ['TRUSTED_PROXY_IPS', hasFrontend ? '${GATEWAY_IP:?Set GATEWAY_IP in Coolify}' : ''],
    ['STRIPE_PRICE_PLANS', '${STRIPE_PRICE_PLANS:-{}}'],
    ['PRODUCT_MODEL', productModel],
  ]);
  const required = new Set(['DATABASE_URL', 'REDIS_URL', 'SECRET_KEY', 'FRONTEND_URL', 'CORS_ORIGINS', 'EMAIL_DELIVERY_URL', 'EMAIL_DELIVERY_TOKEN']);
  for (const [key, value] of fixed) values.set(key, value);
  return [...values].map(([key, value]) => {
    const reference = fixed.has(key) ? value : required.has(key)
      ? `\${${key}:?Set ${key} in Coolify}`
      : `\${${key}:-${value && !/replace-me|example\.com|localhost|price_example/.test(value) ? value : ''}}`;
    return `      ${key}: ${JSON.stringify(reference)}`;
  }).join('\n');
}

function coolifyCompose(backend, frontend, environment) {
  const services = [];
  if (backend) {
    for (const [name, target] of [['api', 'runtime'], ['migrate', 'migrate']]) {
      services.push(`  ${name}:
    build:
      context: ../backend
      target: ${target}
    environment:
${environment}
    networks:${frontend ? `
      private:
        ipv4_address: \${${name === 'api' ? 'API_IP:?Set API_IP in Coolify' : 'MIGRATE_IP:?Set MIGRATE_IP in Coolify'}}` : ' [private]'}${name === 'api' ? `
    expose: ["8000"]
    healthcheck:
      test: ${backend.key === 'fastapi' ? '["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen(\'http://127.0.0.1:8000/ready\', timeout=1)"]' : '["CMD", "node", "-e", "fetch(\'http://127.0.0.1:8000/ready\').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]'}
      interval: 5s
      timeout: 2s
      retries: 12
      start_period: 10s
    restart: unless-stopped` : '\n    profiles: ["migrate"]'}`);
    }
  }
  if (frontend) {
    const buildArgs = frontend.key === 'nextjs' ? '      args:\n        API_PROXY_TARGET: http://api:8000\n' : frontend.key === 'astro' ? '      args:\n        PUBLIC_SITE_URL: ${FRONTEND_URL:?Set FRONTEND_URL in Coolify}\n        PUBLIC_API_BASE_URL: ""\n' : '';
    services.push(`  frontend:
    build:
      context: ../frontend
      target: runtime
${buildArgs}    environment:
      PORT: "3000"${frontend.key === 'react-router' ? '\n      API_PROXY_TARGET: http://api:8000' : ''}
    expose: ["3000"]
    networks: [private]
    restart: unless-stopped`);
    services.push(`  gateway:
    build:
      context: .
      dockerfile: gateway.coolify.Dockerfile
    depends_on:
      frontend:
        condition: service_started${backend ? '\n      api:\n        condition: service_healthy' : ''}
    expose: ["80"]
    networks:${backend ? `
      private:
        ipv4_address: \${GATEWAY_IP:?Set GATEWAY_IP in Coolify}` : ' [private]'}
    restart: unless-stopped`);
  }
  return `services:
${services.join('\n\n')}

networks:
  private:${backend && frontend ? `
    ipam:
      config:
        - subnet: \${DEPLOYMENT_SUBNET:?Set DEPLOYMENT_SUBNET in Coolify}` : ''}
`;
}

export function writeCoolifyPreset(directory, backend, frontend, productModel) {
  const deployment = join(directory, 'deployment');
  const example = readFileSync(join(deployment, '.env.production.example'), 'utf8');
  const environment = backend ? environmentEntries(example, productModel, Boolean(frontend)) : '';
  writeFileSync(join(deployment, 'compose.coolify.yaml'), coolifyCompose(backend, frontend, environment));
  if (frontend) {
    writeFileSync(join(deployment, 'gateway.coolify.Dockerfile'), 'FROM nginx:1.27.4-alpine-slim\nCOPY nginx.coolify.conf /etc/nginx/conf.d/default.conf\n');
    const generic = readFileSync(join(deployment, 'nginx.conf'), 'utf8');
    const http = generic.slice(generic.indexOf('server {', generic.indexOf('server {') + 1))
      .replace('listen 443 ssl;', 'listen 80;')
      .replace(/^  ssl_.*\n/gm, '')
      .replace(/^  add_header Strict-Transport-Security.*\n/gm, '');
    writeFileSync(join(deployment, 'nginx.coolify.conf'), http);
  }
  const target = frontend ? 'gateway' : 'api';
  const port = frontend ? '80' : '8000';
  const required = backend
    ? `\`DATABASE_URL\`, \`REDIS_URL\`, \`SECRET_KEY\`, \`FRONTEND_URL\`, \`CORS_ORIGINS\`, \`EMAIL_DELIVERY_URL\`, \`EMAIL_DELIVERY_TOKEN\`${frontend ? ', `DEPLOYMENT_SUBNET`, `GATEWAY_IP`, `API_IP` y `MIGRATE_IP`' : ''}`
    : '`FRONTEND_URL`';
  const migrationGuide = backend
    ? 'Antes de cada despliegue de una versión nueva ejecuta una sola vez `docker compose -f deployment/compose.coolify.yaml --profile migrate run --rm migrate` con las variables de Coolify disponibles en el host. Comprueba el resultado antes de iniciar la API. En Coolify, una alternativa es lanzar el servicio `migrate` como trabajo manual del mismo recurso; nunca lo ejecutes en paralelo con varias réplicas.'
    : 'Este sitio estático no tiene migraciones.';
  const proxyGuide = frontend && backend
    ? 'El gateway sólo enruta después de que la API responda en `/ready`. `GATEWAY_IP` determina el único proxy de confianza de la API.'
    : backend
      ? 'La API no confía en cabeceras de proxy por defecto. Si necesitas la IP real del cliente, configura una lista explícita de proxies de confianza antes de activar `TRUST_PROXY_HEADERS`.'
      : 'El gateway sirve el sitio estático sin certificados locales.';
  writeFileSync(join(deployment, 'COOLIFY.md'), `# Preset Coolify

Usa **Docker Compose desde Git** con el archivo \`deployment/compose.coolify.yaml\`. Asigna el dominio HTTPS al servicio \`${target}\` en su puerto interno \`${port}\` y deja que Coolify gestione TLS. No actives el modo Raw. La configuración genérica en \`compose.yaml\` sigue disponible.

Configura en Coolify todas las variables marcadas como obligatorias por \`\${NAME:?}\`: ${required}. ${backend ? 'Usa PostgreSQL y Redis externos con TLS y un adaptador de correo HTTPS. Configura OAuth y Stripe si activas esas funciones.' : 'Este sitio estático no necesita base de datos ni secretos de API.'} No copies ni sobrescribas ningún \`.env\` existente. Las variables opcionales se pueden configurar en Coolify sin guardarlas en Git.

${migrationGuide}

Comprueba ${backend ? '\`/ready\` en el dominio' : 'la página principal'} tras el despliegue. ${proxyGuide} ${backend ? 'Los datos viven fuera del stack: mantén copias de seguridad y prueba su restauración en PostgreSQL y Redis.' : ''} ${backend && frontend ? 'Asigna un `DEPLOYMENT_SUBNET` exclusivo de este proyecto y direcciones `GATEWAY_IP`, `API_IP` y `MIGRATE_IP` diferentes dentro de él.' : ''}

Al actualizar un proyecto generado, usa \`create-my-saas upgrade --dry-run\` y revisa el plan antes de aplicar. El upgrade preserva los archivos editados y no toca los secretos ni los datos.
`);
}
