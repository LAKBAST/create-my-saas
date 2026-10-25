import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findTemplate, loadCatalog } from './catalog.js';

export const MANIFEST_FILE = '.create-my-saas.json';

// Decode strictly: invalid UTF-8 and binary control bytes must survive unchanged.
// This also protects images (including ICO/PNG) from accidental CRLF rewriting.
export function normalizedFileContents(buffer) {
  if (/^(?:GIF8[79]a|BM|RIFF|%PDF-)/.test(buffer.subarray(0, 6).toString('latin1'))) return buffer;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (buffer.some((byte) => byte < 32 && ![9, 10, 12, 13].includes(byte))) return buffer;
    // Replace bytes rather than re-encoding, preserving a possible UTF-8 BOM.
    if (!buffer.includes(Buffer.from('\r\n'))) return buffer;
    return Buffer.from(buffer.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');
  } catch {
    return buffer;
  }
}

export function fileDigest(buffer) {
  return createHash('sha256').update(normalizedFileContents(buffer)).digest('hex');
}

export function buildManifest(projectDirectory, { cliVersion, backend = null, frontend = null, templates, features = [], extensions = [] }) {
  // Accept the original short-ID API as well as catalog records. Callers with
  // persisted v2 template metadata can pass templates directly.
  if (templates === undefined) {
    const catalog = typeof backend === 'string' || typeof frontend === 'string' ? loadCatalog() : null;
    templates = {};
    for (const [kind, selection] of [['backend', backend], ['frontend', frontend]]) {
      if (!selection) continue;
      const template = typeof selection === 'string' ? findTemplate(catalog, kind, selection) : selection;
      templates[kind] = { id: template.id, version: template.version, source: template.directory ?? template.source };
    }
  }
  const files = [];
  function visit(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${prefix}${entry.name}`;
      if (path === MANIFEST_FILE) continue;
      if (entry.isDirectory()) visit(join(directory, entry.name), `${path}/`);
      else if (entry.isFile()) files.push([path, fileDigest(readFileSync(join(directory, entry.name)))]);
      else throw new Error(`Cannot include non-regular project file in manifest: ${path}`);
    }
  }
  visit(projectDirectory);
  files.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return {
    schemaVersion: 3,
    cliVersion,
    templates,
    features: [...features].sort(),
    extensions: extensions.map((extension) => ({
      id: extension.id,
      version: extension.version ?? null,
      source: extension.directory ?? extension.source,
      manifestSchemaVersion: extension.schemaVersion ?? extension.manifestSchemaVersion,
    })),
    files: Object.fromEntries(files),
    unmanaged: [],
  };
}

export function writeManifest(projectDirectory, manifest) {
  writeFileSync(join(projectDirectory, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const safePath = (value) => typeof value === 'string' && value.length > 0
  && !/[\\:\x00-\x1f]/.test(value) && value.split('/').every((part) => part && part !== '.' && part !== '..');
const strings = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);

function validateManifest(manifest) {
  const require = (condition, message) => {
    if (!condition) throw new Error(`Invalid ${MANIFEST_FILE}: ${message}`);
  };
  require(isObject(manifest), 'expected an object.');
  require(manifest.schemaVersion === 3, 'schemaVersion must be 3.');
  require(typeof manifest.cliVersion === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(manifest.cliVersion), 'cliVersion must be a version string.');
  require(isObject(manifest.templates) && Object.keys(manifest.templates).length > 0
    && Object.entries(manifest.templates).every(([kind, template]) => ['backend', 'frontend'].includes(kind)
      && isObject(template) && typeof template.id === 'string' && new RegExp(`^${kind}:[a-z][a-z0-9-]*$`).test(template.id)
      && typeof template.version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(template.version)
      && safePath(template.source) && Object.keys(template).every((key) => ['id', 'version', 'source'].includes(key))),
  'templates must contain backend and/or frontend entries with id, version and relative source.');
  require(strings(manifest.features) && manifest.features.every((id, index) => /^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?$/.test(id)
    && (index === 0 || manifest.features[index - 1] <= id)), 'features must be a sorted array of feature IDs.');
  require(Array.isArray(manifest.extensions) && manifest.extensions.every((extension) => isObject(extension)
    && typeof extension.id === 'string' && /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(extension.id)
    && (extension.version === null || (typeof extension.version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(extension.version)))
    && safePath(extension.source) && Number.isInteger(extension.manifestSchemaVersion) && extension.manifestSchemaVersion >= 1
    && Object.keys(extension).every((key) => ['id', 'version', 'source', 'manifestSchemaVersion'].includes(key))),
  'extensions must contain { id, version, source, manifestSchemaVersion } entries.');
  require(new Set(manifest.extensions.map(({ id }) => id)).size === manifest.extensions.length, 'extension IDs must be unique.');
  require(isObject(manifest.files), 'files must be an object.');
  for (const [path, digest] of Object.entries(manifest.files)) {
    require(safePath(path) && path !== MANIFEST_FILE, `files contains an unsafe or reserved path: ${path}`);
    require(typeof digest === 'string' && /^[a-f0-9]{64}$/.test(digest), `files[${path}] must be a SHA-256 hex digest.`);
  }
  require(strings(manifest.unmanaged) && manifest.unmanaged.every(safePath)
    && new Set(manifest.unmanaged).size === manifest.unmanaged.length, 'unmanaged must be an array of unique relative paths.');
  require(Object.keys(manifest).every((key) => ['schemaVersion', 'cliVersion', 'templates', 'features', 'extensions', 'files', 'unmanaged'].includes(key)), 'unexpected manifest field.');
  return manifest;
}

export function readManifest(projectDirectory) {
  let contents;
  try {
    contents = readFileSync(join(projectDirectory, MANIFEST_FILE), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  let manifest;
  try {
    manifest = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Invalid ${MANIFEST_FILE}: malformed JSON.`, { cause: error });
  }
  return validateManifest(manifest);
}
