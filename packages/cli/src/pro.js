import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatUpgradeSummary, gitClean, readProjectManifest, upgradeProject } from './upgrade.js';

const defaultStoreUrl = 'https://tienda.lakbast.com';
const help = `Usage:
  create-my-saas pro list [--token <token>]
  create-my-saas pro add <module> [project] [--version X.Y.Z] [--dry-run] [--allow-dirty] [--token <token>]`;

export function parseProArguments(argumentsList) {
  if (argumentsList[0] === '--help' || argumentsList[0] === '-h') {
    return { action: 'list', moduleId: undefined, projectDirectory: '.', version: undefined, token: undefined, dryRun: false, allowDirty: false, help: true };
  }
  const [action, ...rest] = argumentsList;
  if (!['list', 'add'].includes(action)) throw new Error('Usa "create-my-saas pro list" o "create-my-saas pro add <módulo> [proyecto]".');

  const options = { action, moduleId: undefined, projectDirectory: '.', version: undefined, token: undefined, dryRun: false, allowDirty: false, help: false };
  let project;
  let moduleSeen = false;
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    const separator = argument.indexOf('=');
    const name = argument.startsWith('--') && separator !== -1 ? argument.slice(0, separator) : argument;
    const inline = name === argument ? undefined : argument.slice(separator + 1);
    if (name === '--token' || (name === '--version' && action === 'add')) {
      const value = inline ?? rest[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Falta el valor de ${name}.`);
      if (inline === undefined) index += 1;
      if (name === '--token') options.token = value;
      else options.version = value.replace(/^v/, '');
    } else if (argument === '--dry-run' && action === 'add') options.dryRun = true;
    else if (argument === '--allow-dirty' && action === 'add') options.allowDirty = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument.startsWith('-')) throw new Error(`Opción desconocida: ${argument}`);
    else if (action === 'add' && !moduleSeen) {
      options.moduleId = argument.startsWith('pro:') ? argument.slice('pro:'.length) : argument;
      if (!options.moduleId) throw new Error('Indica el módulo Pro que quieres añadir.');
      moduleSeen = true;
    } else if (action === 'add' && project === undefined) project = argument;
    else throw new Error(`Argumento inesperado: ${argument}`);
  }
  if (project !== undefined) options.projectDirectory = project;
  if (action === 'add' && !moduleSeen && !options.help) throw new Error('Indica el módulo Pro que quieres añadir.');
  return options;
}

function apiErrorMessage(status, code) {
  if (status === 403 && code === 'licence_suspended') return 'La licencia está suspendida. Contacta con soporte de la Tienda LAKBAST.';
  if (status === 403 && code === 'licence_revoked') return 'La licencia ha sido revocada y no puede descargar módulos.';
  if (status === 404 && code === 'version_not_found') return 'La versión solicitada no existe para esta licencia.';
  if (status === 409 && code === 'delivery_integrity_failed') return 'La entrega no superó la comprobación de integridad. Inténtalo más tarde o contacta con soporte.';
  if (status === 401 || status === 403) return 'El token de cliente no es válido o no tiene acceso a esta licencia.';
  if (status === 404) return 'No se encontró la licencia o el recurso solicitado.';
  return `La Tienda LAKBAST respondió con un error (HTTP ${status}).`;
}

function responseCode(payload) {
  if (typeof payload?.code === 'string') return payload.code;
  if (typeof payload?.error === 'string') return payload.error;
  if (typeof payload?.error?.code === 'string') return payload.error.code;
  return undefined;
}

async function request(path, token, { binary = false, notFound } = {}) {
  const baseUrl = (process.env.CREATE_MY_SAAS_STORE_URL || defaultStoreUrl).replace(/\/+$/, '');
  const response = await fetch(new URL(path, `${baseUrl}/`), { headers: { 'X-Customer-Token': token } });
  if (!response.ok) {
    let payload;
    try { payload = await response.json(); } catch { /* The status still identifies the failure. */ }
    if (response.status === 404 && notFound) throw new Error(notFound);
    throw new Error(apiErrorMessage(response.status, responseCode(payload)));
  }
  if (binary) return Buffer.from(await response.arrayBuffer());
  try { return await response.json(); } catch { throw new Error('La Tienda LAKBAST devolvió una respuesta JSON no válida.'); }
}

// The Store answers 404 to the licence list when no customer has that token.
const licencesRequest = (token) => request('/store-api/licences', token, { notFound: 'El token de cliente no es válido. Cópialo de nuevo desde la Tienda LAKBAST.' });

function requireToken(options) {
  const token = options.token ?? process.env.CREATE_MY_SAAS_TOKEN;
  if (!token) throw new Error('Falta el token de cliente. Usa --token o define CREATE_MY_SAAS_TOKEN.');
  return token;
}

function projectManifest(projectDirectory) {
  try {
    const manifest = readProjectManifest(projectDirectory);
    if (!manifest) throw new Error(`No se encontró .create-my-saas.json en "${projectDirectory}".`);
    return manifest;
  } catch (error) {
    throw new Error(`No se pudo leer el proyecto: ${error.message}`);
  }
}

function productForModule(moduleId) {
  return `pro:${moduleId}`;
}

function versionPath(licenceId, communityVersion) {
  return `/store-api/licences/${encodeURIComponent(licenceId)}/versions?community=${encodeURIComponent(communityVersion)}`;
}

function versionRequirement(versionInfo) {
  const requirements = [...new Set((versionInfo.versions ?? []).map(({ requires }) => requires?.cli).filter(Boolean))];
  return requirements.length ? requirements.join(', ') : 'una versión Community compatible indicada por la Tienda';
}

function chooseVersion(payload, requested, communityVersion) {
  const entries = Array.isArray(payload.versions) ? payload.versions : [];
  if (requested) {
    const selected = entries.find(({ version }) => version === requested);
    if (!selected) throw new Error(`La versión Pro ${requested} no está disponible para esta licencia.`);
    if (selected.compatible !== true) throw new Error(`La versión Pro ${requested} no es compatible con Community ${communityVersion}. Requiere ${selected.requires?.cli ?? versionRequirement(payload)}.`);
    return selected;
  }

  const recommendedVersion = typeof payload.recommended === 'string' ? payload.recommended : payload.recommended?.version;
  const selected = entries.find(({ version, compatible }) => version === recommendedVersion && compatible === true);
  if (selected) return selected;
  throw new Error(`No hay una versión Pro compatible con Community ${communityVersion}. Requiere Community ${versionRequirement(payload)}.`);
}

const shortId = (id) => typeof id === 'string' ? id.split(':').at(-1) : undefined;

function stackDescription(stack) {
  const ids = [stack.backend?.id, stack.frontend?.id].filter(Boolean).map(shortId);
  return `${stack.feature} (${ids.join(' + ') || 'stack no especificado'})`;
}

function chooseStack(version, manifest) {
  const stack = (version.supportedStacks ?? []).find((candidate) =>
    shortId(candidate.backend?.id) === manifest.backendId
    && shortId(candidate.frontend?.id) === manifest.frontendId);
  if (stack?.feature) return stack;
  const supported = (version.supportedStacks ?? []).map(stackDescription);
  throw new Error(`El módulo no soporta el stack ${manifest.backendId ?? 'sin backend'} + ${manifest.frontendId ?? 'sin frontend'}. Stacks compatibles: ${supported.join('; ') || 'ninguno'}.`);
}

function extractDelivery(archive, temporaryDirectory) {
  const archivePath = join(temporaryDirectory, 'module.tar.gz');
  writeFileSync(archivePath, archive);
  // Relative paths from the temporary directory: GNU tar (Git Bash on Windows)
  // reads "C:\..." as a remote host.
  const listing = spawnSync('tar', ['-tzf', 'module.tar.gz'], { cwd: temporaryDirectory, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (listing.error || listing.status !== 0) throw new Error('No se pudo inspeccionar el archivo de entrega con tar.');
  const entries = listing.stdout.split(/\r?\n/).filter(Boolean);
  const roots = new Set();
  for (const entry of entries) {
    const parts = entry.split('/').filter(Boolean);
    if (!parts.length || entry.startsWith('/') || entry.includes('\\') || /^[A-Za-z]:/.test(entry) || parts.some((part) => part === '.' || part === '..')) {
      throw new Error('El archivo de entrega contiene una ruta no válida.');
    }
    roots.add(parts[0]);
  }
  if (roots.size !== 1) throw new Error('El archivo de entrega debe contener una única carpeta raíz.');

  const extractedDirectory = join(temporaryDirectory, 'extracted');
  mkdirSync(extractedDirectory);
  const result = spawnSync('tar', ['-xzf', 'module.tar.gz', '-C', 'extracted'], { cwd: temporaryDirectory, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error('No se pudo extraer el archivo de entrega con tar.');
  const rootDirectory = join(extractedDirectory, [...roots][0]);
  if (!existsSync(join(rootDirectory, 'delivery.manifest.json'))) throw new Error('El archivo de entrega no contiene delivery.manifest.json.');
  return rootDirectory;
}

async function listLicences(options, { log }) {
  const token = requireToken(options);
  const manifest = readProjectManifest(options.projectDirectory);
  const response = await licencesRequest(token);
  const licences = Array.isArray(response.licences) ? response.licences : [];
  if (!licences.length) { log('No hay licencias asociadas a este token.'); return 0; }
  for (const licence of licences) {
    let line = `${licence.id} (${licence.product ?? 'producto desconocido'}) — ${licence.status ?? 'estado desconocido'}`;
    if (manifest?.cliVersion && String(licence.product ?? '').startsWith('pro:') && String(licence.status).toLowerCase() === 'active') {
      const versions = await request(versionPath(licence.id, manifest.cliVersion), token);
      const recommended = typeof versions.recommended === 'string' ? versions.recommended : versions.recommended?.version;
      const available = versions.versions?.some(({ version, compatible }) => version === recommended && compatible === true);
      if (available) line += ` — recomendada para Community ${manifest.cliVersion}: ${recommended}`;
    }
    log(line);
  }
  return 0;
}

async function addModule(options, { log, upgrade = upgradeProject }) {
  const token = requireToken(options);
  const manifest = projectManifest(options.projectDirectory);
  if (!manifest.cliVersion) throw new Error('El proyecto no registra cliVersion en .create-my-saas.json y no se puede comprobar la compatibilidad.');

  const licencesResponse = await licencesRequest(token);
  const product = productForModule(options.moduleId);
  const licence = (licencesResponse.licences ?? []).find(({ product: licenceProduct, status }) =>
    licenceProduct === product && String(status).toLowerCase() === 'active');
  if (!licence) throw new Error(`No tienes una licencia activa para ${product}.`);

  const versions = await request(versionPath(licence.id, manifest.cliVersion), token);
  const selectedVersion = chooseVersion(versions, options.version, manifest.cliVersion);
  const selectedStack = chooseStack(selectedVersion, manifest);
  const command = `create-my-saas upgrade ${JSON.stringify(options.projectDirectory)} --feature ${selectedStack.feature} --extensions-dir "<carpeta temporal>"`;
  log(`Licencia: ${licence.id} (${licence.product}, ${licence.status})`);
  log(`Versión: ${selectedVersion.version}`);
  log(`Feature: ${selectedStack.feature}`);
  log(`Comando: ${command}`);
  if (options.dryRun) return 0;
  // Same rule as upgrade, checked before downloading anything.
  if (!options.allowDirty) {
    const git = gitClean(options.projectDirectory);
    if (!git.repository) throw new Error('pro add necesita el proyecto en un repositorio git para poder revisar y deshacer los cambios. Usa --allow-dirty para continuar igualmente.');
    if (!git.clean) throw new Error('Haz commit o stash de tus cambios antes de añadir el módulo (o usa --allow-dirty).');
  }

  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'create-my-saas-module-'));
  try {
    const archive = await request(`/store-api/licences/${encodeURIComponent(licence.id)}/download?version=${encodeURIComponent(selectedVersion.version)}`, token, { binary: true });
    const extensionDirectory = extractDelivery(archive, temporaryDirectory);
    const result = upgrade({ projectDirectory: options.projectDirectory, featureIds: [selectedStack.feature], extensionsDirectories: [extensionDirectory], allowDirty: options.allowDirty });
    log(formatUpgradeSummary(result));
    return result.plan.some(({ action }) => action === 'conflict') ? 2 : 0;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function runProCommand(argumentsList, { log = console.log, error = console.error, upgrade } = {}) {
  try {
    const options = parseProArguments(argumentsList);
    if (options.help) { log(help); return 0; }
    return options.action === 'list'
      ? await listLicences(options, { log })
      : await addModule(options, { log, upgrade });
  } catch (caughtError) {
    error(`Error: ${caughtError.message}`);
    error('Ejecuta create-my-saas pro --help para ver cómo se usa.');
    return 1;
  }
}