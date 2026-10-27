// `create-my-saas upgrade`: brings a generated project up to the current CLI
// with a three-way merge per file. The base is the project regenerated with the
// version it came from, so the user's edits survive while template changes
// arrive. The project must be a clean git checkout so every change is reviewable.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { defaultExtensionsDirectory } from './catalog.js';
import { generateProject } from './generator.js';
import { fileDigest, MANIFEST_FILE, normalizedFileContents, readManifest } from './manifest.js';

const cliVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const isBinary = (buffer) => buffer.subarray(0, 8000).includes(0);

/** What upgrade needs from a schema 2 or 3 manifest (validated by manifest.js). */
export function readProjectManifest(projectDirectory) {
  const manifest = readManifest(projectDirectory);
  if (!manifest) return null;
  const shortId = (template) => template?.id.split(':').at(-1);
  return {
    schemaVersion: manifest.schemaVersion,
    cliVersion: manifest.cliVersion ?? undefined,
    backendId: shortId(manifest.templates.backend),
    frontendId: shortId(manifest.templates.frontend),
    featureIds: manifest.features,
    ...(manifest.productModel === undefined ? {} : { productModel: manifest.productModel }),
    unmanaged: manifest.unmanaged,
  };
}

function listFiles(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push(relative(root, path).split(sep).join('/'));
    }
  };
  walk(root);
  return files.filter((file) => file !== MANIFEST_FILE);
}

/** Generates the base project with a published CLI version through npm. */
export function generateWithPublishedCli({ version, destination, backendId, frontendId, featureIds, extensionsDirectories, productModel }) {
  const args = ['exec', '--yes', '--package', `@soymanolo/create-my-saas@${version}`, '--', 'create-my-saas', destination];
  if (backendId) args.push('--backend', backendId);
  if (frontendId) args.push('--frontend', frontendId);
  if (productModel !== undefined) args.push('--product-model', productModel);
  for (const feature of featureIds) args.push('--feature', feature);
  for (const directory of extensionsDirectories) args.push('--extensions-dir', directory);
  // npm is a .cmd script on Windows, which only runs through a shell: pass one quoted command line.
  const result = process.platform === 'win32'
    ? spawnSync(['npm', ...args].map((arg) => (/[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg)).join(' '), { encoding: 'utf8', shell: true })
    : spawnSync('npm', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Could not generate the base project with create-my-saas@${version}:\n${result.stderr || result.stdout}`);
}

function gitClean(projectDirectory) {
  const result = spawnSync('git', ['status', '--porcelain'], { cwd: projectDirectory, encoding: 'utf8' });
  if (result.status !== 0) return { repository: false, clean: false };
  return { repository: true, clean: result.stdout.trim() === '' };
}

/** Three-way merge with `git merge-file`; returns the merged text and whether it conflicts. */
function mergeText(current, base, incoming) {
  const workspace = mkdtempSync(join(tmpdir(), 'create-my-saas-merge-'));
  try {
    const files = { current: join(workspace, 'current'), base: join(workspace, 'base'), incoming: join(workspace, 'incoming') };
    writeFileSync(files.current, current); writeFileSync(files.base, base); writeFileSync(files.incoming, incoming);
    const result = spawnSync('git', ['merge-file', '-p', '-L', 'tu versión', '-L', 'base', '-L', 'nueva plantilla', files.current, files.base, files.incoming], { encoding: 'buffer' });
    if (result.status === null || result.status < 0) throw new Error(`git merge-file failed: ${result.stderr?.toString() ?? result.error?.message}`);
    return { text: result.stdout, conflict: result.status > 0 };
  } finally { rmSync(workspace, { recursive: true, force: true }); }
}

/** Keeps the user's CRLF line endings when writing template text over their file. */
function matchLineEndings(text, like) {
  if (!like || isBinary(like) || !like.includes('\r\n')) return text;
  return Buffer.from(text.toString('utf8').replace(/\r?\n/g, '\r\n'), 'utf8');
}

/**
 * Plans (and unless dryRun, applies) the upgrade. Each entry has a `path` and an
 * `action`: updated, added, removed, merged, conflict, kept, skipped.
 */
export function upgradeProject({
  projectDirectory,
  fromVersion,
  extensionsDirectories = [],
  dryRun = false,
  allowDirty = false,
  generateBase = generateWithPublishedCli,
  // Each CLI version brings its own bundled extensions; only the user's directories are shared.
  generateCurrent = (options) => generateProject({ ...options, extensionsDirectories: [defaultExtensionsDirectory, ...options.extensionsDirectories] }),
}) {
  const project = resolve(projectDirectory);
  const manifest = readProjectManifest(project);
  if (!manifest) throw new Error(`No ${MANIFEST_FILE} in ${project}; is this a project generated by create-my-saas?`);
  const baseVersion = fromVersion ?? manifest.cliVersion;
  if (!baseVersion) throw new Error(`This project was generated before ${MANIFEST_FILE} recorded the CLI version. Pass the version it came from with --from <version>.`);
  if (!manifest.backendId && !manifest.frontendId) throw new Error(`${MANIFEST_FILE} does not record any template.`);

  const git = gitClean(project);
  if (!allowDirty && !dryRun) {
    if (!git.repository) throw new Error('upgrade needs the project in a git repository so its changes can be reviewed and undone. Use --allow-dirty to continue anyway.');
    if (!git.clean) throw new Error('Commit or stash your changes before upgrading (or use --allow-dirty).');
  }

  const workspace = mkdtempSync(join(tmpdir(), 'create-my-saas-upgrade-'));
  try {
    const selection = { backendId: manifest.backendId, frontendId: manifest.frontendId, featureIds: manifest.featureIds, ...(manifest.productModel === undefined ? {} : { productModel: manifest.productModel }) };
    const baseDirectory = join(workspace, 'base');
    const currentDirectory = join(workspace, 'current');
    generateBase({ version: baseVersion, destination: baseDirectory, ...selection, extensionsDirectories });
    generateCurrent({ destination: currentDirectory, ...selection, extensionsDirectories });

    const unmanaged = new Set(manifest.unmanaged);
    const baseFiles = new Set(listFiles(baseDirectory));
    const currentFiles = new Set(listFiles(currentDirectory));
    const plan = [];
    for (const path of [...new Set([...baseFiles, ...currentFiles])].sort()) {
      if (unmanaged.has(path)) { plan.push({ path, action: 'skipped' }); continue; }
      const target = join(project, path);
      const base = baseFiles.has(path) ? readFileSync(join(baseDirectory, path)) : undefined;
      const incoming = currentFiles.has(path) ? readFileSync(join(currentDirectory, path)) : undefined;
      const mine = existsSync(target) ? readFileSync(target) : undefined;
      const same = (a, b) => a !== undefined && b !== undefined && fileDigest(a) === fileDigest(b);

      if (incoming === undefined) {
        // Removed by the template: delete it only if the user never changed it.
        if (mine === undefined) continue;
        plan.push(same(mine, base) ? { path, action: 'removed' } : { path, action: 'kept', reason: 'la plantilla lo eliminó, pero lo has modificado' });
      } else if (base !== undefined && same(base, incoming)) {
        continue; // The template did not change this file.
      } else if (mine === undefined) {
        plan.push(base === undefined ? { path, action: 'added', content: incoming } : { path, action: 'kept', reason: 'lo eliminaste y la plantilla lo ha cambiado' });
      } else if (same(mine, incoming)) {
        continue; // Already up to date.
      } else if (base !== undefined && same(mine, base)) {
        plan.push({ path, action: 'updated', content: matchLineEndings(incoming, mine) });
      } else if (isBinary(mine) || isBinary(incoming)) {
        plan.push({ path, action: 'conflict', reason: 'archivo binario modificado por las dos partes', sidecar: incoming });
      } else {
        const merged = mergeText(normalizedFileContents(mine), normalizedFileContents(base ?? Buffer.alloc(0)), normalizedFileContents(incoming));
        plan.push({ path, action: merged.conflict ? 'conflict' : 'merged', content: matchLineEndings(merged.text, mine) });
      }
    }

    if (!dryRun) {
      for (const entry of plan) {
        const target = join(project, entry.path);
        if (entry.action === 'removed') unlinkSync(target);
        if (entry.content) { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, entry.content); }
        if (entry.sidecar) writeFileSync(`${target}.upgrade-new`, entry.sidecar);
      }
      // The new generation's manifest becomes the base of the next upgrade.
      const next = existsSync(join(currentDirectory, MANIFEST_FILE)) ? JSON.parse(readFileSync(join(currentDirectory, MANIFEST_FILE), 'utf8')) : {};
      next.unmanaged = [...unmanaged].sort();
      writeFileSync(join(project, MANIFEST_FILE), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    }
    return { fromVersion: baseVersion, toVersion: cliVersion, plan: plan.map(({ content, sidecar, ...entry }) => entry) };
  } finally { rmSync(workspace, { recursive: true, force: true }); }
}

const labels = {
  updated: 'Actualizados', added: 'Añadidos', removed: 'Eliminados', merged: 'Fusionados sin conflictos',
  conflict: 'Con conflictos (resuélvelos antes de hacer commit)', kept: 'Conservados', skipped: 'No gestionados',
};

export function formatUpgradeSummary({ fromVersion, toVersion, plan }, { dryRun = false } = {}) {
  const lines = [`create-my-saas ${fromVersion} → ${toVersion}${dryRun ? ' (simulación, no se ha escrito nada)' : ''}`];
  if (plan.length === 0) return [...lines, 'El proyecto ya está al día.'].join('\n');
  for (const action of Object.keys(labels)) {
    const entries = plan.filter((entry) => entry.action === action);
    if (entries.length) lines.push('', `${labels[action]} (${entries.length}):`, ...entries.map((entry) => `  ${entry.path}${entry.reason ? ` — ${entry.reason}` : ''}`));
  }
  if (plan.some((entry) => entry.action === 'conflict')) {
    lines.push('', 'Busca las marcas <<<<<<< en los archivos con conflictos; los binarios dejan la versión nueva en <archivo>.upgrade-new.');
  }
  if (!dryRun) lines.push('', 'Revisa los cambios con git diff y haz commit cuando estés conforme.');
  return lines.join('\n');
}
