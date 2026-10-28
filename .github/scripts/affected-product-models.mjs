// Select only model-contract combinations touched by the changed templates.
import { appendFileSync, readFileSync } from 'node:fs';

const combinations = [
  { backend: 'fastapi', frontend: 'nextjs', product_model: 'individual' },
  { backend: 'nestjs', frontend: 'react-router', product_model: 'mixed' },
  { backend: 'fastapi', frontend: 'astro', feature: 'billing', product_model: 'mixed' },
  { backend: 'fastify', frontend: 'astro', product_model: 'individual' },
];
const files = process.argv.slice(2).filter((value) => value !== '--full');
if (!process.stdin.isTTY && files.length === 0 && !process.argv.includes('--full')) files.push(...readFileSync(0, 'utf8').split(/\r?\n/).filter(Boolean));
const sourceFiles = files.filter((file) => !file.endsWith('.md'));
const full = process.argv.includes('--full') || sourceFiles.some((file) => [
  'packages/cli/src/generator.js', 'packages/cli/src/cli.js', 'packages/cli/src/demo-seed.js',
  'templates/shared/api-contract.ts',
  'scripts/e2e-generated-projects.mjs', '.github/workflows/verify-product-models.yml',
  '.github/scripts/affected-product-models.mjs',
].includes(file));
const selected = combinations.filter((entry) => full || sourceFiles.some((file) =>
  file.startsWith(`templates/backend/${entry.backend}-starter/`)
  || file.startsWith(`templates/frontend/${entry.frontend}-starter/`)
  || (entry.feature && file.startsWith('extensions/community-astro-billing/'))));
const output = JSON.stringify(selected);
console.log(`matrix=${output}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${output}\n`);
