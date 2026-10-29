import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { defaultExtensionsDirectory, defaultTemplatesDirectory, findTemplate, loadCatalog } from './catalog.js';
import { extensionTargetFiles, resolveExtensions, selectExtensions } from './extensions.js';
import { buildManifest, normalizedFileContents, writeManifest } from './manifest.js';
import { writeCoolifyPreset } from './coolify-preset.js';

const { version: cliVersion } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const excludedDirectoryNames = new Set([
  '.git',
  '.next',
  '.pnpm-store',
  '.pytest_cache',
  '.ruff_cache',
  '.turbo',
  '.uv-validation-cache',
  '.venv',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  '.features',
  'node_modules',
]);

// .gitignore is excluded so source checkouts behave like the npm package,
// which never ships it; writeGitignore generates the project's rules instead.
const excludedFileNames = new Set(['.DS_Store', '.gitignore', 'AGENTS.md', 'CLAUDE.md']);

function shouldCopy(source) {
  const entryName = basename(source);

  return !excludedDirectoryNames.has(entryName)
    && !excludedFileNames.has(entryName)
    && !entryName.endsWith('.pyc')
    && !entryName.endsWith('.tsbuildinfo');
}

function copyTemplate(templatesDirectory, destinationDirectory, kind, template) {
  const sourceDirectory = template.sourceDirectory;

  if (!existsSync(sourceDirectory)) {
    throw new Error(`Template source not found: ${sourceDirectory}`);
  }

  cpSync(sourceDirectory, join(destinationDirectory, kind), {
    recursive: true,
    errorOnExist: true,
    filter: shouldCopy,
  });
}

function configureFrontendApiProxyTarget(destinationDirectory, backend) {
  const envExamplePath = join(destinationDirectory, 'frontend', '.env.example');
  if (!existsSync(envExamplePath)) {
    throw new Error(`Frontend template is missing .env.example: ${envExamplePath}`);
  }

  const originalContents = normalizedFileContents(readFileSync(envExamplePath)).toString('utf8');
  const apiProxyTargetPattern = /^API_PROXY_TARGET=.*$/m;
  if (!apiProxyTargetPattern.test(originalContents)) {
    throw new Error(`Frontend .env.example is missing API_PROXY_TARGET: ${envExamplePath}`);
  }

  const configuredContents = originalContents.replace(
    apiProxyTargetPattern,
    () => `API_PROXY_TARGET=${backend.development.baseUrl}`,
  );
  writeFileSync(envExamplePath, configuredContents, 'utf8');
}

// Routes the backend owns behind the gateway. Backend capabilities count too:
// Stripe webhooks reach /billing even when the frontend has no billing page.
function thirdPartyNotices(templateLicense) {
  return `# Third-party notices

This project was generated with [create-my-saas](https://github.com/SoyManoolo/create-my-saas)
and includes code from its templates. That code is distributed under the
licence below, which must be kept with it. The rest of the project is yours:
add a LICENSE file with the terms you choose (generated projects declare
\`"license": "UNLICENSED"\` until you do).

\`\`\`text
${templateLicense.trim()}
\`\`\`

Dependencies keep their own licences.
`;
}

function frontendApiPrefixes(backend, frontend, extensions = []) {
  const requiredCapabilities = [
    ...(backend?.capabilities ?? []),
    ...(frontend?.compatibility?.requiresBackendCapabilities ?? []),
    ...extensions.flatMap((extension) => extension.requires.capabilities),
  ];
  const prefixes = ['auth', 'users', ...extensions.flatMap((extension) => extension.apiPrefixes ?? [])];
  if (backend?.capabilities.includes('workspaces.product-model')) prefixes.push('workspaces');
  if (requiredCapabilities.includes('organizations')) prefixes.push('organizations');
  if (requiredCapabilities.includes('billing.stripe')) prefixes.push('billing');
  return [...new Set(prefixes)];
}

function backendDatabaseUrl(backend) {
  return backend.key === 'fastapi'
    ? 'postgresql+asyncpg://app:replace-me@postgres.example.com:5432/app'
    : 'postgresql://app:replace-me@postgres.example.com:5432/app';
}

function backendReadinessHealthcheck(backend) {
  const command = backend.key === 'fastapi'
    ? ['CMD', 'python', '-c', "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/ready', timeout=1)"]
    : ['CMD', 'node', '-e', "fetch('http://127.0.0.1:8000/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"];
  return JSON.stringify(command);
}

function frontendBuildArguments(frontend) {
  if (frontend.key === 'nextjs') return '      args:\n        API_PROXY_TARGET: http://api:8000\n';
  if (frontend.key === 'astro') return '      args:\n        PUBLIC_SITE_URL: ${FRONTEND_URL}\n        PUBLIC_API_BASE_URL: ""\n';
  return '';
}

function deploymentCompose(backend, frontend) {
  const services = [];
  if (backend) {
    services.push(`  api:
    build:
      context: ../backend
      target: runtime
    env_file:
      - .env
    environment:
      PORT: "8000"
    expose:
      - "8000"
    healthcheck:
      test: ${backendReadinessHealthcheck(backend)}
      interval: 5s
      timeout: 2s
      retries: 12
      start_period: 10s${frontend ? '' : `\n    ports:\n      - "${'${API_BIND_ADDRESS:-127.0.0.1}'}:${'${API_PORT:-8000}'}:8000"`}
    networks:
      private:
        ipv4_address: ${'${API_IP:-172.30.0.30}'}
    restart: unless-stopped`);

    services.push(`  migrate:
    build:
      context: ../backend
      target: migrate
    env_file:
      - .env
    environment:
      PORT: "8000"
    profiles: ["migrate"]
    networks:
      private:
        ipv4_address: ${'${MIGRATE_IP:-172.30.0.31}'}`);
  }
  if (frontend) {
    services.push(`  frontend:
    build:
      context: ../frontend
      target: runtime
${frontendBuildArguments(frontend)}    environment:
      PORT: "3000"${frontend.key === 'react-router' ? '\n      API_PROXY_TARGET: http://api:8000' : ''}
    expose:
      - "3000"
    networks:
      private:
        ipv4_address: ${'${FRONTEND_IP:-172.30.0.20}'}
    restart: unless-stopped`);

    services.push(`  gateway:
    build:
      context: .
      dockerfile: gateway.Dockerfile
    depends_on:
      frontend:
        condition: service_started${backend ? '\n      api:\n        condition: service_healthy' : ''}
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./certs:/etc/nginx/certs:ro
    profiles: ["production"]
    networks:
      private:
        ipv4_address: ${'${GATEWAY_IP:-172.30.0.10}'}
    restart: unless-stopped`);
  }

  return `name: create-my-saas

services:
${services.join('\n\n')}

networks:
  private:
    ipam:
      config:
        - subnet: ${'${DEPLOYMENT_SUBNET:-172.30.0.0/24}'}
`;
}

function developmentCompose(backend, frontend) {
  const services = [];
  if (backend) {
    const databaseUrl = backend.key === 'fastapi'
      ? 'postgresql+asyncpg://postgres:postgres@postgres:5432/app'
      : 'postgresql://postgres:postgres@postgres:5432/app';
    services.push(`  postgres:
    image: postgres:17.4-bookworm
    environment:
      POSTGRES_DB: app
      POSTGRES_PASSWORD: postgres
      POSTGRES_USER: postgres
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d app"]
      interval: 5s
      timeout: 5s
      retries: 20
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks: [private]

  redis:
    image: redis:7.4.2-bookworm
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis-data:/data
    networks: [private]

  api:
    environment:
      APP_ENV: development
      DATABASE_URL: ${databaseUrl}
      DATABASE_SSL: "false"
      REDIS_URL: redis://redis:6379
      FRONTEND_URL: http://localhost:3000
      CORS_ORIGINS: http://localhost:3000
      COOKIE_SECURE: "false"
      TRUST_PROXY_HEADERS: "false"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    ports:
      - "127.0.0.1:${'${API_PORT:-8000}'}:8000"

  migrate:
    environment:
      APP_ENV: development
      DATABASE_URL: ${databaseUrl}
      DATABASE_SSL: "false"
      REDIS_URL: redis://redis:6379
      FRONTEND_URL: http://localhost:3000
      CORS_ORIGINS: http://localhost:3000
      COOKIE_SECURE: "false"
      TRUST_PROXY_HEADERS: "false"
    depends_on:
      postgres:
        condition: service_healthy`);
  }
  if (frontend) {
    services.push(`  frontend:
    ports:
      - "127.0.0.1:${'${FRONTEND_PORT:-3000}'}:3000"`);
  }
  return `services:
${services.join('\n\n')}
${backend ? '\nvolumes:\n  postgres-data:\n  redis-data:\n' : ''}`;
}

function mergeEnvironmentContents(contents, variables, extensionId, scope) {
  if (variables.length === 0) return contents;
  const values = new Map([...contents.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map(([, name, value]) => [name, value]));
  const additions = [];
  for (const variable of variables) {
    const existing = values.get(variable.name);
    if (existing !== undefined && existing !== variable.value) throw new Error(`Extension "${extensionId}" conflicts with ${scope} environment variable "${variable.name}".`);
    if (existing === undefined) {
      additions.push(`# ${variable.description}\n${variable.name}=${variable.secret ? '' : variable.value}`);
      values.set(variable.name, variable.secret ? '' : variable.value);
    }
  }
  return additions.length > 0 ? `${contents.replace(/\s*$/, '')}\n\n${additions.join('\n\n')}\n` : contents;
}

function productionEnvironmentExample(backend, extensions) {
  if (!backend) {
    let contents = '# This static frontend has no server-side secrets.\nFRONTEND_URL=https://app.example.com\n';
    for (const extension of extensions) contents = mergeEnvironmentContents(contents, extension.deploymentEnvironment ?? [], extension.id, 'deployment');
    return contents;
  }
  const source = readFileSync(join(backend.sourceDirectory, '.env.example'), 'utf8');
  const replacements = new Map([
    ['APP_ENV', 'production'],
    ['PORT', '8000'],
    ['DATABASE_URL', backendDatabaseUrl(backend)],
    ['DATABASE_SSL', 'true'],
    ['SECRET_KEY', 'replace-with-at-least-32-random-characters'],
    ['FRONTEND_URL', 'https://app.example.com'],
    ['CORS_ORIGINS', 'https://app.example.com'],
    ['COOKIE_SECURE', 'true'],
    ['REDIS_URL', 'rediss://replace-me@redis.example.com:6380/0'],
    ['TRUST_PROXY_HEADERS', 'true'],
    ['TRUSTED_PROXY_IPS', '172.30.0.10'],
  ]);
  const seen = new Set();
  const configured = source.split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || !replacements.has(match[1])) return line;
    seen.add(match[1]);
    return `${match[1]}=${replacements.get(match[1])}`;
  });
  for (const [name, value] of replacements) if (!seen.has(name) && ['DATABASE_SSL', 'TRUST_PROXY_HEADERS', 'TRUSTED_PROXY_IPS'].includes(name)) configured.push(`${name}=${value}`);
  let contents = `# Copy this file to .env. It is deliberately invalid until every replace-me value and\n# every selected email, OAuth, and Stripe setting is configured. Do not commit .env.\n${configured.join('\n')}\n`;
  for (const extension of extensions) contents = mergeEnvironmentContents(contents, extension.deploymentEnvironment ?? [], extension.id, 'deployment');
  return contents;
}

function deploymentGuide(backend, frontend) {
  const apiLine = backend
    ? frontend
      ? `La API seleccionada es **${backend.displayName}** y escucha sólo en la red privada de Compose.`
      : `La API seleccionada es **${backend.displayName}**. Compose publica su puerto en \`127.0.0.1:8000\` por defecto; configura \`API_BIND_ADDRESS\` y \`API_PORT\` si necesitas otro enlace.`
    : 'No se seleccionó API; el gateway sólo sirve el frontend estático.';
  const frontendLine = frontend ? `El frontend seleccionado es **${frontend.displayName}**.` : 'No se seleccionó frontend; coloca un gateway TLS externo delante de la API enlazada a loopback.';
  const tlsStep = frontend
    ? 'Entrega el certificado y la clave TLS en \`certs/fullchain.pem\` y \`certs/privkey.pem\` con permiso de lectura para Docker. El gateway publica 80/443, elimina las cabeceras \`X-Forwarded-*\` entrantes y reconstruye las suyas. Mantén \`GATEWAY_IP\` y \`TRUSTED_PROXY_IPS\` iguales para que la API sólo confíe en ese proxy fijo.'
    : 'Configura un gateway TLS externo que reenvíe las peticiones a la API publicada en loopback. Si el gateway está en otro host, configura \`API_BIND_ADDRESS\` y restringe el acceso a ese puerto; ajusta \`TRUSTED_PROXY_IPS\` a la IP del proxy de confianza.';
  const readiness = frontend
    ? 'Compose comprueba \`/ready\` y el gateway no empieza a enrutar hasta que PostgreSQL y, cuando el rate limiting está activo, Redis estén disponibles. Comprueba \`https://app.example.com/ready\` tras el arranque; \`/health\` sólo confirma que el proceso sigue vivo.'
    : 'Compose comprueba \`/ready\`. Comprueba \`http://127.0.0.1:8000/ready\` en el host con el enlace predeterminado, o el puerto configurado con \`API_PORT\`; tras configurar el gateway TLS externo, comprueba también su URL pública \`/ready\`. \`/health\` sólo confirma que el proceso sigue vivo.';
  const productionSteps = backend
    ? `1. Provisiona PostgreSQL y Redis **gestionados con TLS**. No se publican contenedores de datos en esta receta: el contrato fail-closed exige una URL de PostgreSQL con certificado verificable y una \`REDIS_URL\` con esquema \`rediss://\`.
2. Copia \`.env.production.example\` a \`.env\`, reemplaza todos los secretos y configura email, OAuth y Stripe si se usan. El archivo \`.env\` es un secreto de runtime; nunca se añade a la imagen ni al repositorio.
3. ${tlsStep}
4. Ejecuta la migración como un trabajo de release, una vez por versión, antes de iniciar réplicas de la API:

\`\`\`sh
docker compose --env-file .env --profile migrate run --rm migrate
${frontend ? 'docker compose --env-file .env --profile production up -d --build' : 'docker compose --env-file .env up -d --build api'}
\`\`\`

No automatices \`migrate\` dentro del arranque de cada réplica: permite revisar el resultado y evita carreras entre despliegues simultáneos. ${readiness}`
    : `1. Copia \`.env.production.example\` a \`.env\` y ajusta \`FRONTEND_URL\` al dominio público del sitio.
2. Entrega el certificado y la clave TLS en \`certs/fullchain.pem\` y \`certs/privkey.pem\` con permiso de lectura para Docker. El gateway publica 80/443.
3. Inicia el frontend y el gateway:

\`\`\`sh
docker compose --env-file .env --profile production up -d --build
\`\`\`

Comprueba \`https://app.example.com/\` tras el arranque (sustituye el dominio por el configurado en \`FRONTEND_URL\`).`;
  const localServices = frontend ? 'api frontend' : 'api';
  const localCommands = backend
    ? `docker compose -f compose.yaml -f compose.dev.yaml --env-file .env up -d postgres redis
docker compose -f compose.yaml -f compose.dev.yaml --env-file .env --profile migrate run --rm migrate
docker compose -f compose.yaml -f compose.dev.yaml --env-file .env up --build ${localServices}`
    : 'docker compose -f compose.yaml -f compose.dev.yaml --env-file .env up --build frontend';
  return `# Despliegue reproducible

${apiLine}

${frontendLine}

Para Coolify, usa el preset independiente descrito en \`COOLIFY.md\`.

## Producción

Desde la raíz del proyecto generado, entra en \`deployment\` antes de ejecutar los comandos siguientes.

${productionSteps}

## Comprobación local integrada

${backend ? '\`compose.dev.yaml\` levanta PostgreSQL y Redis sin TLS exclusivamente para desarrollo. Conserva \`APP_ENV=development\`; no representa una topología de producción.' : '\`compose.dev.yaml\` publica el frontend en loopback para comprobarlo sin certificados TLS.'}

\`\`\`sh
cp .env.production.example .env
${localCommands}
\`\`\`

${frontend ? 'Abre \`http://localhost:3000/\` para comprobar el sitio.' : 'Comprueba \`http://localhost:8000/ready\` para verificar la API.'}

${backend ? 'Usa \`docker compose ... down -v\` sólo para descartar deliberadamente los datos locales de esa comprobación. En producción realiza copias de seguridad, pruebas de restauración y rotación de secretos en los servicios gestionados.' : ''}
`;
}

function writeDeployment(destinationDirectory, backend, frontend, extensions) {
  const deploymentDirectory = join(destinationDirectory, 'deployment');
  mkdirSync(deploymentDirectory, { recursive: true });
  writeFileSync(join(deploymentDirectory, 'compose.yaml'), deploymentCompose(backend, frontend), 'utf8');
  writeFileSync(join(deploymentDirectory, 'compose.dev.yaml'), developmentCompose(backend, frontend), 'utf8');
  writeFileSync(join(deploymentDirectory, '.env.production.example'), productionEnvironmentExample(backend, extensions), 'utf8');
  writeFileSync(join(deploymentDirectory, 'README.md'), deploymentGuide(backend, frontend), 'utf8');
  if (frontend) {
    writeFileSync(join(deploymentDirectory, '.dockerignore'), '.env\ncerts/\n', 'utf8');
    writeFileSync(join(deploymentDirectory, 'gateway.Dockerfile'), 'FROM nginx:1.27.4-alpine-slim\nCOPY nginx.conf /etc/nginx/conf.d/default.conf\n', 'utf8');
  const apiPrefixes = frontendApiPrefixes(backend, frontend, extensions).join('|');
  writeFileSync(join(deploymentDirectory, 'nginx.conf'), `server {
  listen 80;
  server_name _;
  return 308 https://$host$request_uri;
}

server {
  listen 443 ssl;
  server_name _;
  ssl_certificate /etc/nginx/certs/fullchain.pem;
  ssl_certificate_key /etc/nginx/certs/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

  location = /health {
    proxy_pass http://${backend ? 'api:8000' : 'frontend:3000'};
    proxy_set_header Host $host;
  }

${backend ? `  location = /ready {
    proxy_pass http://api:8000;
    proxy_set_header Host $host;
  }

  # Keep the admin page on the frontend; proxy its data under a distinct alias.
  location ^~ /api/admin/ {
    rewrite ^/api/admin/(.*)$ /admin/$1 break;
    proxy_pass http://api:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto https;
  }

  # Frontend pages under an API prefix (regexes match in order): without this,
  # reloading them returned the API's 404.
  location ~ ^/(billing|auth/oauth/callback)/?$ {
    proxy_pass http://frontend:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto https;
  }

  location ~ ^/(${apiPrefixes})(/|$) {
    proxy_pass http://api:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto https;
  }

` : ''}  location / {
    proxy_pass http://frontend:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto https;
  }
}
`, 'utf8');
  }
}

// npm never packs .gitignore files, so template copies cannot be relied on:
// derive the ignore rules from the files each selected layer actually ships.
function layerIgnorePatterns(layerDirectory) {
  const files = readdirSync(layerDirectory).sort();
  const has = (name) => files.some((file) => file === name || file.startsWith(`${name}.`));
  const patterns = [];

  if (has('pyproject')) {
    patterns.push('.venv/', '__pycache__/', '*.py[cod]', '.pytest_cache/', '.ruff_cache/', '.mypy_cache/', '.uv-cache/', '.coverage', 'htmlcov/');
  }
  if (has('package')) {
    patterns.push('node_modules/', '.pnpm-store/', 'dist/', 'coverage/', '*.tsbuildinfo');
  }
  if (has('next.config')) patterns.push('.next/', 'out/');
  if (has('astro.config')) patterns.push('.astro/');
  if (has('react-router.config')) patterns.push('.react-router/', 'build/');

  return patterns;
}

function writeGitignore(destinationDirectory, backend, frontend) {
  const sections = [
    ['Secrets', ['.env', '.env.*', '!.env.example', '!.env.*.example', ...(frontend ? ['/deployment/certs/'] : [])]],
  ];
  const seen = new Set(sections[0][1]);

  for (const [kind, template] of [['backend', backend], ['frontend', frontend]]) {
    if (!template) continue;
    const patterns = layerIgnorePatterns(join(destinationDirectory, kind)).filter((pattern) => !seen.has(pattern));
    patterns.forEach((pattern) => seen.add(pattern));
    if (patterns.length > 0) sections.push([`${kind}: ${template.displayName}`, patterns]);
  }
  sections.push(['Logs and editors', ['*.log', '.DS_Store', '.idea/', '.vscode/*', '!.vscode/extensions.json']]);

  const contents = sections.map(([title, patterns]) => `# ${title}\n${patterns.join('\n')}\n`).join('\n');
  writeFileSync(join(destinationDirectory, '.gitignore'), contents, 'utf8');
}

function assertCompatibleTemplates(backend, frontend) {
  const requiredCapabilities = [
    ...(frontend.compatibility?.requiresBackendCapabilities ?? []),
  ];
  const backendCapabilities = new Set(backend.capabilities);
  const missingCapabilities = requiredCapabilities.filter((capability) => !backendCapabilities.has(capability));

  if (missingCapabilities.length > 0) {
    throw new Error(
      `Frontend "${frontend.key}" is not compatible with backend "${backend.key}". `
      + `Missing backend capabilities: ${missingCapabilities.join(', ')}.`,
    );
  }
}

function extensionInstallationPlan(extensions, backend, frontend) {
  const templates = new Map([[backend?.id, backend], [frontend?.id, frontend]].filter(([id]) => id));
  const baseFiles = new Map();
  const writtenFiles = new Map();
  const plan = [];
  for (const extension of extensions) {
    for (const target of extension.targets) {
      const template = templates.get(target.template);
      if (!template) throw new Error(`Extension "${extension.id}" requires template "${target.template}".`);
      if (!baseFiles.has(template.id)) baseFiles.set(template.id, new Set(templateFiles(template.sourceDirectory)));
      const files = extensionTargetFiles(extension, target);
      const fileNames = new Set(files.map(({ relativePath }) => relativePath));
      for (const replacement of target.replace) {
        if (!fileNames.has(replacement)) throw new Error(`Extension "${extension.id}" declares replacement "${replacement}" that is not in its overlay.`);
        if (!baseFiles.get(template.id).has(replacement)) throw new Error(`Extension "${extension.id}" declares replacement "${replacement}" that does not exist in ${target.template}.`);
      }
      for (const migration of target.migrations) {
        if (!fileNames.has(migration)) throw new Error(`Extension "${extension.id}" declares migration "${migration}" that is not in its overlay.`);
      }
      for (const file of files) {
        if (file.relativePath === '.env.example') throw new Error(`Extension "${extension.id}" must declare environment variables instead of overlaying .env.example.`);
        const destinationKey = `${target.template}/${file.relativePath}`;
        if (writtenFiles.has(destinationKey)) throw new Error(`Extensions "${writtenFiles.get(destinationKey)}" and "${extension.id}" both write "${destinationKey}".`);
        if (baseFiles.get(template.id).has(file.relativePath) && !target.replace.includes(file.relativePath)) {
          throw new Error(`Extension "${extension.id}" would replace Community file "${destinationKey}" without declaring it.`);
        }
        writtenFiles.set(destinationKey, extension.id);
      }
      plan.push({ extension, target, template, files });
    }
  }
  return plan;
}

function templateFiles(directory) {
  const files = [];
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      if (!shouldCopy(join(current, entry.name))) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      if (entry.isFile()) files.push(resolve(path));
    }
  }
  visit(directory);
  return files.map((file) => file.slice(resolve(directory).length + 1).replaceAll('\\', '/'));
}

function mergeEnvironment(destinationDirectory, kind, variables, extensionId) {
  if (variables.length === 0) return;
  const environmentPath = join(destinationDirectory, kind, '.env.example');
  if (!existsSync(environmentPath)) throw new Error(`Extension "${extensionId}" requires .env.example in ${kind}.`);
  const contents = normalizedFileContents(readFileSync(environmentPath)).toString('utf8');
  writeFileSync(environmentPath, mergeEnvironmentContents(contents, variables, extensionId, kind), 'utf8');
}

function applyExtensions(destinationDirectory, plan) {
  for (const { extension, target, template, files } of plan) {
    const kind = template.kind;
    for (const file of files) {
      const destination = join(destinationDirectory, kind, file.relativePath);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(file.source, destination);
    }
    mergeEnvironment(destinationDirectory, kind, target.environment, extension.id);
  }
}

function fastapiIntegrations(extensions) {
  return extensions.flatMap((extension) => {
    const integration = extension.integrations?.fastapi;
    return integration ? [{ extension, integration }] : [];
  });
}

function writeExtensionIntegrations(destinationDirectory, backend, frontend, extensions) {
  if (backend?.id === 'backend:fastapi') {
    const integrations = fastapiIntegrations(extensions);
    const routers = integrations.flatMap(({ integration }) => integration.routers ?? []);
    const settings = integrations.flatMap(({ integration }) => integration.settings ?? []);
    const auditActions = integrations.flatMap(({ integration }) => integration.auditActions ?? []);
    const duplicate = (values, key) => values.find((value, index) => values.findIndex((other) => other[key] === value[key]) !== index);
    const duplicatedSetting = duplicate(settings, 'name');
    const duplicatedAction = duplicate(auditActions, 'name');
    if (new Set(routers).size !== routers.length) throw new Error('Selected extensions declare the same FastAPI router.');
    if (duplicatedSetting) throw new Error(`Selected extensions declare configuration "${duplicatedSetting.name}" more than once.`);
    if (duplicatedAction) throw new Error(`Selected extensions declare audit action "${duplicatedAction.name}" more than once.`);
    const contents = `# Generated by create-my-saas. Do not edit manually.\nfrom importlib import import_module\nimport os\n\nEXTENSION_ROUTERS = ${JSON.stringify(routers)}\nEXTENSION_SETTINGS = ${JSON.stringify(settings, null, 2)}\nEXTENSION_AUDIT_ACTIONS = ${JSON.stringify(Object.fromEntries(auditActions.map(({ name, metadata }) => [name, metadata])), null, 2)}\n\ndef include_extension_routers(app):\n    for reference in EXTENSION_ROUTERS:\n        module_name, attribute = reference.split(\":\", 1)\n        app.include_router(getattr(import_module(module_name), attribute))\n\ndef extension_value(name: str) -> str:\n    setting = next((item for item in EXTENSION_SETTINGS if item[\"name\"] == name), None)\n    if setting is None:\n        raise KeyError(f\"Unknown extension setting: {name}\")\n    return os.getenv(name, setting[\"default\"])\n\ndef validate_extension_settings() -> None:\n    for setting in EXTENSION_SETTINGS:\n        if len(extension_value(setting[\"name\"])) < setting[\"minLength\"]:\n            raise RuntimeError(f\"{setting['name']} is required and must contain at least {setting['minLength']} characters.\")\n`;
    const registryPath = join(destinationDirectory, 'backend', 'src', 'core', 'extensions.py');
    mkdirSync(dirname(registryPath), { recursive: true });
    writeFileSync(registryPath, contents, 'utf8');
    // Required extension settings stop the API from starting, including the
    // template's own tests that boot it. unittest imports every test module
    // before running any test, so this module gives the whole discovered
    // suite test-only values while real environments keep failing closed.
    if (settings.some((setting) => setting.minLength > 0)) {
      const testsPath = join(destinationDirectory, 'backend', 'tests', 'test_extension_settings.py');
      mkdirSync(dirname(testsPath), { recursive: true });
      writeFileSync(testsPath, [
        '# Generated by create-my-saas. Do not edit manually.',
        '"""Test-only values for required extension settings.',
        '',
        'unittest imports every test module before it runs any test, so these values',
        'apply to the whole `unittest discover` run. They are never used outside the',
        'test suite; every real environment must provide its own values.',
        '"""',
        'import os',
        'import unittest',
        'from unittest.mock import patch',
        '',
        'from src.core.extensions import EXTENSION_SETTINGS, validate_extension_settings',
        '',
        'REQUIRED_SETTINGS = [setting for setting in EXTENSION_SETTINGS if setting["minLength"] > 0]',
        '',
        'for _setting in REQUIRED_SETTINGS:',
        '    os.environ.setdefault(_setting["name"], "test-only-value-" + "x" * _setting["minLength"])',
        '',
        '',
        'class ExtensionSettingsTests(unittest.TestCase):',
        '    def test_required_settings_reject_short_values(self):',
        '        for setting in REQUIRED_SETTINGS:',
        '            short = "x" * (setting["minLength"] - 1)',
        '            with self.subTest(setting=setting["name"]), patch.dict(os.environ, {setting["name"]: short}):',
        '                with self.assertRaisesRegex(RuntimeError, setting["name"]):',
        '                    validate_extension_settings()',
        '',
      ].join('\n'), 'utf8');
    }
  }
  if (frontend?.id === 'frontend:nextjs') {
    const routes = extensions.flatMap((extension) => extension.integrations?.frontendRoutes ?? []);
    if (new Set(routes).size !== routes.length) throw new Error('Selected extensions declare the same frontend route.');
    const routesPath = join(destinationDirectory, 'frontend', 'app', 'extensions.generated.ts');
    mkdirSync(dirname(routesPath), { recursive: true });
    writeFileSync(routesPath, `// Generated by create-my-saas.\nexport const extensionRoutes = ${JSON.stringify(routes)} as const;\n`, 'utf8');
  }
}

// Canonical bytes and permissions are independent of Git autocrlf, source modes
// and the caller's umask. Shebang scripts remain executable on Unix.
function normalizeProject(directory) {
  chmodSync(directory, 0o755);
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) normalizeProject(path);
    else if (entry.isFile()) {
      const original = readFileSync(path);
      const contents = normalizedFileContents(original);
      if (!contents.equals(original)) writeFileSync(path, contents);
      chmodSync(path, contents.subarray(0, 2).toString() === '#!' ? 0o755 : 0o644);
    } else throw new Error('Cannot generate non-regular project file: ' + path);
  }
}

export function generateProject({
  destination,
  backendId,
  frontendId,
  productModel,
  featureIds = [],
  templatesDirectory = defaultTemplatesDirectory,
  extensionsDirectories = [defaultExtensionsDirectory],
}) {
  if (!backendId && !frontendId) {
    throw new Error('Select at least one template with --backend or --frontend.');
  }

  const outputDirectory = resolve(destination);

  if (existsSync(outputDirectory)) {
    throw new Error(`Destination already exists: ${outputDirectory}`);
  }

  const catalog = loadCatalog(templatesDirectory, extensionsDirectories);
  const backend = backendId ? findTemplate(catalog, 'backend', backendId) : undefined;
  const frontend = frontendId ? findTemplate(catalog, 'frontend', frontendId) : undefined;
  if (productModel !== undefined && !['individual', 'teams', 'mixed'].includes(productModel)) throw new Error('Unknown product model. Choose individual, teams, or mixed.');
  if (productModel !== undefined && !backend) throw new Error('--product-model requires a backend.');
  const resolvedProductModel = backend ? (productModel ?? (backend.capabilities.includes('organizations') ? 'teams' : 'individual')) : undefined;
  if (['teams', 'mixed'].includes(resolvedProductModel) && !backend.capabilities.includes('organizations')) throw new Error('This backend does not support teams or mixed product models.');
  const extensions = resolveExtensions(selectExtensions(catalog.extensions, [...featureIds].sort()), { backend, frontend, cliVersion });
  const installationPlan = extensionInstallationPlan(extensions, backend, frontend);

  if (backend && frontend) {
    assertCompatibleTemplates(backend, frontend);
  }

  const outputParentDirectory = dirname(outputDirectory);
  let temporaryDirectory;

  try {
    mkdirSync(outputParentDirectory, { recursive: true });
    temporaryDirectory = mkdtempSync(join(outputParentDirectory, `.${basename(outputDirectory)}-`));

    // The project belongs to whoever generates it, so it gets no LICENSE of its
    // own; the MIT notice of the template code it contains goes in a notice file.
    const templateLicense = join(templatesDirectory, 'LICENSE');
    if (existsSync(templateLicense)) {
      writeFileSync(join(temporaryDirectory, 'THIRD_PARTY_NOTICES.md'), thirdPartyNotices(readFileSync(templateLicense, 'utf8')), 'utf8');
    }

    if (backend) {
      copyTemplate(templatesDirectory, temporaryDirectory, 'backend', backend);
    }

    if (frontend) {
      copyTemplate(templatesDirectory, temporaryDirectory, 'frontend', frontend);
    }

    applyExtensions(temporaryDirectory, installationPlan);
    writeExtensionIntegrations(temporaryDirectory, backend, frontend, extensions);

    if (backend && frontend && frontend.compatibility?.requiresBackendCapabilities?.length > 0) {
      configureFrontendApiProxyTarget(temporaryDirectory, backend);
    }

    writeDeployment(temporaryDirectory, backend, frontend, extensions);
    if (backend) {
      for (const path of [join(temporaryDirectory, 'backend', '.env.example'), join(temporaryDirectory, 'deployment', '.env.production.example')]) {
        const current = readFileSync(path, 'utf8');
        const value = `PRODUCT_MODEL=${resolvedProductModel}`;
        writeFileSync(path, /^PRODUCT_MODEL=.*$/m.test(current) ? current.replace(/^PRODUCT_MODEL=.*$/m, value) : `${current.trimEnd()}\n${value}\n`, 'utf8');
      }
    }
    writeCoolifyPreset(temporaryDirectory, backend, frontend, resolvedProductModel);
    writeGitignore(temporaryDirectory, backend, frontend);

    normalizeProject(temporaryDirectory);
    writeManifest(temporaryDirectory, buildManifest(temporaryDirectory, {
      cliVersion,
      backend,
      frontend,
      features: featureIds,
      extensions,
      productModel: resolvedProductModel,
    }));
    chmodSync(join(temporaryDirectory, '.create-my-saas.json'), 0o644);

    if (existsSync(outputDirectory)) {
      throw new Error(`Destination already exists: ${outputDirectory}`);
    }

    renameSync(temporaryDirectory, outputDirectory);
    temporaryDirectory = undefined;
  } catch (error) {
    if (temporaryDirectory) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
    throw new Error(`Could not generate project at ${outputDirectory}: ${error.message}`, { cause: error });
  }

  return { outputDirectory, backend, frontend, extensions };
}
