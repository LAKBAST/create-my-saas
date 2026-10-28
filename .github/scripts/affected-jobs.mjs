// Decides which jobs of the "Verify starter templates" workflow must run.
//
// Usage: node .github/scripts/affected-jobs.mjs [--full] [changed-file ...]
// Without --full, the changed files are read from the arguments or, when there
// are none, from standard input (one path per line). The decisions are written
// to $GITHUB_OUTPUT when it is set and always printed for the job log.
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';

const backends = ['fastapi', 'fastify', 'nestjs'];
const frontends = ['astro', 'nextjs', 'react-router'];
const apiPorts = { fastapi: 8000, nestjs: 3001 };

// Each combination lists the backend, the frontend and the optional feature
// (a Community extension alias) it exercises.
const generatedProjects = [
  { backend: 'fastapi', frontend: 'nextjs' },
  { backend: 'fastapi', frontend: 'react-router' },
  { backend: 'nestjs', frontend: 'nextjs' },
  { backend: 'nestjs', frontend: 'react-router' },
].map((entry) => ({ ...entry, api_port: apiPorts[entry.backend] }));
const generatedE2e = [
  { backend: 'fastapi', frontend: 'nextjs' },
  { backend: 'fastapi', frontend: 'react-router' },
  { backend: 'fastapi', frontend: 'astro' },
  { backend: 'fastapi', frontend: 'astro', features: 'billing' },
  { backend: 'nestjs', frontend: 'nextjs' },
  { backend: 'nestjs', frontend: 'react-router' },
  { backend: 'nestjs', frontend: 'astro' },
  { backend: 'nestjs', frontend: 'astro', features: 'billing' },
  { backend: 'fastify', frontend: 'astro' },
];

// Maps every extension alias (the value passed to --feature) to its directory.
const extensionByFeature = {};
for (const directory of readdirSync('extensions', { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const manifest = JSON.parse(readFileSync(`extensions/${directory.name}/extension.manifest.json`, 'utf8'));
  for (const alias of manifest.aliases ?? []) extensionByFeature[alias] = directory.name;
}

const argumentsList = process.argv.slice(2);
let full = argumentsList.includes('--full');
let files = argumentsList.filter((value) => value !== '--full');
if (!full && files.length === 0) files = readFileSync(0, 'utf8').split(/\r?\n/);
files = files.map((file) => file.trim()).filter(Boolean);

const changed = { backend: new Set(), frontend: new Set(), extension: new Set() };
const reasons = [];
for (const file of files) {
  // Documentation never needs the heavy jobs. The always-on "Generator CLI"
  // job still validates template READMEs and audits every tracked file.
  if (file.endsWith('.md') || file.startsWith('docs/')) continue;
  const template = /^templates\/(backend|frontend)\/([^/]+)-starter\//.exec(file);
  if (template) { changed[template[1]].add(template[2]); continue; }
  const extension = /^extensions\/([^/]+)\//.exec(file);
  if (extension) { changed.extension.add(extension[1]); continue; }
  if (file === 'templates/shared/api-contract.ts') { frontends.forEach((name) => changed.frontend.add(name)); continue; }
  if (file === 'packages/cli/test/api-contract.test.js') continue;
  // CLI setup/doctor/seed have focused unit tests in the always-on generator job.
  if (['packages/cli/src/cli.js', 'packages/cli/src/local-setup.js', 'packages/cli/src/demo-seed.js', 'packages/cli/test/local-setup.test.js', 'packages/cli/test/demo-seed.test.js', 'packages/cli/test/ci-selection.test.js'].includes(file)) continue;
  // The model contract has its own selected-combination workflow.
  if (['scripts/e2e-generated-projects.mjs', '.github/workflows/verify-product-models.yml', '.github/scripts/affected-product-models.mjs', '.github/scripts/affected-jobs.mjs'].includes(file)) continue;
  // Changes to the generator, manifests, shared templates or unknown paths
  // may affect any generated combination.
  full = true;
  reasons.push(file);
}

const touches = (entry) => full
  || changed.backend.has(entry.backend)
  || changed.frontend.has(entry.frontend)
  || (entry.features !== undefined && changed.extension.has(extensionByFeature[entry.features]));

const outputs = {
  full: String(full),
  generated_projects: JSON.stringify(generatedProjects.filter(touches)),
  generated_e2e: JSON.stringify(generatedE2e.filter(touches)),
  static_site: String(touches({ backend: 'fastapi', frontend: 'astro' })),
  billing_extension: String(touches({ backend: 'fastapi', frontend: 'astro', features: 'billing' })),
};
for (const backend of backends) outputs[backend] = String(full || changed.backend.has(backend));
for (const frontend of frontends) outputs[frontend.replace('-', '_')] = String(full || changed.frontend.has(frontend));

console.log(`Changed files: ${files.length}${full ? ' (full matrix)' : ''}`);
if (reasons.length) console.log(`Full matrix because of: ${reasons.slice(0, 20).join(', ')}`);
for (const [name, value] of Object.entries(outputs)) console.log(`${name}=${value}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([name, value]) => `${name}=${value}\n`).join(''));
