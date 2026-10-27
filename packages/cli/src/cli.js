import { defaultExtensionsDirectory, loadCatalog } from './catalog.js';
import { generateProject } from './generator.js';
import { seedDemo } from './demo-seed.js';
import { doctorProject, setupLocal } from './local-setup.js';
import { formatUpgradeSummary, upgradeProject } from './upgrade.js';

const usage = `Usage: create-my-saas <destination> [options]
       create-my-saas upgrade [project] [upgrade options]
       create-my-saas setup [project]
       create-my-saas doctor [project] [--no-services]
       create-my-saas seed [project]

Options:
  --backend <id>     Backend template to generate
  --frontend <id>    Frontend template to generate
  --product-model <model>  individual, teams, or mixed (teams for full backends)
  --feature <id>           Enable an extension (repeatable)
  --extensions-dir <path>  Discover an additional local extension directory (repeatable)
  --list             List available templates
  --help, -h         Show this help

Upgrade options:
  --from <version>         CLI version the project was generated with (needed once for older projects)
  --extensions-dir <path>  Extension directory the project was generated with (repeatable)
  --dry-run                Show what would change without writing anything
  --allow-dirty            Upgrade even if the project has uncommitted changes

Examples:
  create-my-saas my-saas --backend nestjs --frontend nextjs
  create-my-saas my-saas --backend nestjs --frontend astro --feature billing
  create-my-saas api-only --backend fastapi
  create-my-saas upgrade --dry-run
  create-my-saas upgrade ./my-saas --from 1.3.3
  create-my-saas setup ./my-saas
  create-my-saas doctor ./my-saas
  create-my-saas seed ./my-saas
`;

function parseProjectCommand(argumentsList, { allowNoServices = false } = {}) {
  let directory = '.';
  let seen = false;
  let services = true;
  for (const argument of argumentsList) {
    if (argument === '--no-services' && allowNoServices) services = false;
    else if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`);
    else if (!seen) { directory = argument; seen = true; }
    else throw new Error(`Unexpected argument: ${argument}`);
  }
  return { directory, services };
}

function listTemplates(log, catalog = loadCatalog()) {
  log('Available templates:');
  for (const kind of ['backend', 'frontend']) {
    log(`\n${kind}:`);
    for (const template of catalog[kind]) {
      const capabilities = template.capabilities.join(', ');
      log(`  ${template.key} (${template.version}) - ${capabilities}`);
    }
  }
  if (catalog.extensions.length > 0) {
    log('\nextensions:');
    for (const extension of catalog.extensions) {
      log(`  ${extension.id} (${extension.version}) - ${extension.description}`);
    }
  }
}

export function parseArguments(argumentsList) {
  const options = { backendId: undefined, frontendId: undefined, featureIds: [], extensionsDirectories: [], destination: undefined, list: false, help: false };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];

    if (argument.startsWith('--backend=')) {
      options.backendId = argument.slice('--backend='.length);
      if (!options.backendId) {
        throw new Error('Missing value for --backend.');
      }
    } else if (argument.startsWith('--frontend=')) {
      options.frontendId = argument.slice('--frontend='.length);
      if (!options.frontendId) {
        throw new Error('Missing value for --frontend.');
      }
    } else if (argument.startsWith('--feature=')) {
      const featureId = argument.slice('--feature='.length);
      if (!featureId) {
        throw new Error('Missing value for --feature.');
      }
      options.featureIds.push(featureId);
    } else if (argument.startsWith('--product-model=')) {
      options.productModel = argument.slice('--product-model='.length);
      if (!options.productModel) throw new Error('Missing value for --product-model.');
    } else if (argument.startsWith('--extensions-dir=')) {
      const directory = argument.slice('--extensions-dir='.length);
      if (!directory) throw new Error('Missing value for --extensions-dir.');
      options.extensionsDirectories.push(directory);
    } else
    if (argument === '--backend' || argument === '--frontend' || argument === '--feature' || argument === '--extensions-dir' || argument === '--product-model') {
      const value = argumentsList[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${argument}.`);
      }
      if (argument === '--feature') options.featureIds.push(value);
      else if (argument === '--extensions-dir') options.extensionsDirectories.push(value);
      else if (argument === '--product-model') options.productModel = value;
      else options[argument === '--backend' ? 'backendId' : 'frontendId'] = value;
      index += 1;
    } else if (argument === '--list') {
      options.list = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (!options.destination) {
      options.destination = argument;
    } else {
      throw new Error(`Unexpected argument: ${argument}`);
    }
  }

  return options;
}

export function parseUpgradeArguments(argumentsList) {
  const options = { projectDirectory: '.', fromVersion: undefined, extensionsDirectories: [], dryRun: false, allowDirty: false, help: false };
  let project;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    const [name, inline] = argument.startsWith('--') && argument.includes('=') ? [argument.slice(0, argument.indexOf('=')), argument.slice(argument.indexOf('=') + 1)] : [argument, undefined];
    if (name === '--from' || name === '--extensions-dir') {
      const value = inline ?? argumentsList[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}.`);
      if (inline === undefined) index += 1;
      if (name === '--from') options.fromVersion = value.replace(/^v/, '');
      else options.extensionsDirectories.push(value);
    } else if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--allow-dirty') options.allowDirty = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`);
    else if (project === undefined) project = argument;
    else throw new Error(`Unexpected argument: ${argument}`);
  }
  if (project !== undefined) options.projectDirectory = project;
  return options;
}

function runUpgrade(argumentsList, log) {
  const options = parseUpgradeArguments(argumentsList);
  if (options.help) { log(usage); return 0; }
  const result = upgradeProject(options);
  log(formatUpgradeSummary(result, { dryRun: options.dryRun }));
  // Conflicts need the user's attention, so scripts can tell them apart.
  return result.plan.some((entry) => entry.action === 'conflict') ? 2 : 0;
}

export function run(argumentsList, { log = console.log, error = console.error } = {}) {
  try {
    if (argumentsList[0] === 'upgrade') return runUpgrade(argumentsList.slice(1), log);
    if (argumentsList[0] === 'setup') {
      const { directory } = parseProjectCommand(argumentsList.slice(1));
      const result = setupLocal(directory);
      for (const path of result.created) log(`Created ${path}`);
      for (const path of result.preserved) log(`Preserved ${path}`);
      log('Local configuration is ready. Run create-my-saas doctor <project> --no-services to check the files.');
      log('Keep deployment/.env for local use; do not copy .env.production.example over it.');
      log('From deployment/:');
      if (result.hasBackend) {
        log('  docker compose -f compose.yaml -f compose.dev.yaml --env-file .env up -d postgres redis');
        log('  Run create-my-saas doctor <project> after these services start.');
        log('  docker compose -f compose.yaml -f compose.dev.yaml --env-file .env --profile migrate run --rm migrate');
      }
      log(`  docker compose -f compose.yaml -f compose.dev.yaml --env-file .env up --build ${[result.hasBackend && 'api', result.hasFrontend && 'frontend'].filter(Boolean).join(' ')}`);
      if (result.hasBackend) log('After the API is ready: create-my-saas seed <project>');
      return 0;
    }
    if (argumentsList[0] === 'doctor') {
      const { directory, services } = parseProjectCommand(argumentsList.slice(1), { allowNoServices: true });
      return doctorProject(directory, { services }).then((result) => {
        for (const item of result.checks) log(`${item.ok ? 'OK' : 'FIX'} ${item.message}${item.ok ? '' : ` — ${item.action}`}`);
        log(result.ok ? 'Local project checks passed.' : 'Local project needs attention.');
        return result.ok ? 0 : 1;
      }).catch((caughtError) => { error(`Error: ${caughtError.message}`); return 1; });
    }
    if (argumentsList[0] === 'seed') {
      const { directory } = parseProjectCommand(argumentsList.slice(1));
      return seedDemo(directory).then((result) => {
        log(`Demo accounts ready: ${result.ownerEmail}, ${result.memberEmail}`);
        log(`Credentials saved in ${result.credentialsPath} (ignored by Git).`);
        if (result.team) log(`Demo team ready: ${result.team.name} (${result.team.slug}).`);
        if (result.personalWorkspace) log('Personal workspace ready.');
        return 0;
      }).catch((caughtError) => { error(`Error: ${caughtError.message}`); return 1; });
    }
    const options = parseArguments(argumentsList);

    if (options.help) {
      log(usage);
      return 0;
    }
    if (options.list) {
      listTemplates(log, loadCatalog(undefined, [defaultExtensionsDirectory, ...options.extensionsDirectories]));
      return 0;
    }
    if (!options.destination) {
      throw new Error('A destination directory is required.');
    }

    const extensionsDirectories = [defaultExtensionsDirectory, ...options.extensionsDirectories];
    const result = generateProject({ ...options, extensionsDirectories });
    log(`Created ${result.outputDirectory}`);
    log(`Next: create-my-saas setup ${result.outputDirectory}`);
    return 0;
  } catch (caughtError) {
    error(`Error: ${caughtError.message}`);
    error('Run create-my-saas --help for usage.');
    return 1;
  }
}

export function main(argumentsList) {
  const result = run(argumentsList);
  if (result instanceof Promise) result.then((code) => { process.exitCode = code; });
  else process.exitCode = result;
}
