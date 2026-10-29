// Copia ../docs/*.md y ../CONTRIBUTING.md al sitio para que esos archivos sigan
// siendo la única fuente de verdad. El resultado está en .gitignore: edita
// siempre los originales.
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const website = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.join(website, '..');
const sourceDir = path.join(repoRoot, 'docs');
const pagesDir = path.join(website, 'src', 'content', 'docs', 'referencia');
const schemasDir = path.join(website, 'public', 'schemas');
const repoBlob = 'https://github.com/LAKBAST/create-my-saas/blob/main/';
const repoEdit = 'https://github.com/LAKBAST/create-my-saas/edit/main/';

const files = await readdir(sourceDir);
await mkdir(pagesDir, { recursive: true });
await rm(schemasDir, { recursive: true, force: true });
await mkdir(schemasDir, { recursive: true });

for (const existing of await readdir(pagesDir)) {
	await rm(path.join(pagesDir, existing));
}

// Cada página: archivo de origen relativo a la raíz del repo y slug publicado.
const pages = files.filter((file) => file.endsWith('.md')).map((file) => ({ source: `docs/${file}`, slug: file.slice(0, -3) }));
pages.push({ source: 'CONTRIBUTING.md', slug: 'contributing' });
const slugs = new Map(pages.map((page) => [page.source, page.slug]));

for (const file of files.filter((file) => file.endsWith('.json'))) {
	await copyFile(path.join(sourceDir, file), path.join(schemasDir, file));
}

for (const { source, slug } of pages) {
	const markdown = await readFile(path.join(repoRoot, source), 'utf8');
	const match = markdown.match(/^#\s+(.+)\r?\n/);
	if (!match) throw new Error(`${source} debe empezar por un título "# ..."`);

	const body = markdown
		.slice(match[0].length)
		.replace(/\]\(([^)\s]+)\)/g, (link, target) => `](${rewriteLink(target, source)})`);
	const frontmatter = [
		'---',
		`title: ${JSON.stringify(match[1].trim())}`,
		`editUrl: ${repoEdit}${source}`,
		'---',
		'',
	].join('\n');
	await writeFile(path.join(pagesDir, `${slug}.md`), frontmatter + body);
}

// Las páginas quedan en /referencia/<slug>/, así que los enlaces relativos
// suben un nivel: ../otra/ para otra página y ../../schemas/ para los JSON.
// El resto apunta al archivo en GitHub.
function rewriteLink(target, source) {
	if (/^(https?:|mailto:|#)/.test(target)) return target;
	const [file, hash = ''] = target.split('#');
	const anchor = hash ? `#${hash}` : '';
	const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(source), file));
	if (slugs.has(resolved)) return `../${slugs.get(resolved)}/${anchor}`;
	if (path.posix.dirname(resolved) === 'docs' && resolved.endsWith('.json') && files.includes(path.posix.basename(resolved))) {
		return `../../schemas/${path.posix.basename(resolved)}`;
	}
	return repoBlob + resolved + anchor;
}
