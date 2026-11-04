// Copia ../docs/*.md y ../CONTRIBUTING.md (español) y ../docs/en/*.md (inglés)
// al sitio para que esos archivos sigan siendo la única fuente de verdad. El
// resultado está en .gitignore: edita siempre los originales.
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const website = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.join(website, '..');
const docsDir = path.join(repoRoot, 'docs');
const schemasDir = path.join(website, 'public', 'schemas');
const repoBlob = 'https://github.com/LAKBAST/create-my-saas/blob/main/';
const repoEdit = 'https://github.com/LAKBAST/create-my-saas/edit/main/';

// Cada idioma: carpeta de origen, guía de contribución, carpeta de destino y
// profundidad de sus páginas bajo la raíz de la web (/referencia/x/ o /en/reference/x/).
const locales = [
	{ source: 'docs', contributing: 'CONTRIBUTING.md', pagesDir: ['referencia'], depth: 1 },
	{ source: 'docs/en', contributing: 'docs/en/contributing.md', pagesDir: ['en', 'reference'], depth: 2 },
];

const files = await readdir(docsDir);
await rm(schemasDir, { recursive: true, force: true });
await mkdir(schemasDir, { recursive: true });
for (const file of files.filter((file) => file.endsWith('.json'))) {
	await copyFile(path.join(docsDir, file), path.join(schemasDir, file));
}

const slugsByLocale = [];
for (const locale of locales) {
	const markdown = (await readdir(path.join(repoRoot, locale.source))).filter((file) => file.endsWith('.md'));
	// Cada página: archivo de origen relativo a la raíz del repo y slug publicado.
	const pages = markdown.map((file) => ({ source: `${locale.source}/${file}`, slug: file.slice(0, -3) }));
	if (!pages.some((page) => page.source === locale.contributing)) pages.push({ source: locale.contributing, slug: 'contributing' });
	slugsByLocale.push(new Set(pages.map((page) => page.slug)));

	const pagesDir = path.join(website, 'src', 'content', 'docs', ...locale.pagesDir);
	await rm(pagesDir, { recursive: true, force: true });
	await mkdir(pagesDir, { recursive: true });
	const slugs = new Map(pages.map((page) => [page.source, page.slug]));

	for (const { source, slug } of pages) {
		const content = await readFile(path.join(repoRoot, source), 'utf8');
		const match = content.match(/^#\s+(.+)\r?\n/);
		if (!match) throw new Error(`${source} debe empezar por un título "# ..."`);

		const body = content
			.slice(match[0].length)
			.replace(/\]\(([^)\s]+)\)/g, (link, target) => `](${rewriteLink(target, source, slugs, locale.depth)})`);
		const frontmatter = [
			'---',
			`title: ${JSON.stringify(match[1].trim())}`,
			`editUrl: ${repoEdit}${source}`,
			'---',
			'',
		].join('\n');
		await writeFile(path.join(pagesDir, `${slug}.md`), frontmatter + body);
	}
}

// Cada página en español necesita su traducción y al revés.
const [es, en] = slugsByLocale;
const missing = [...[...es].filter((slug) => !en.has(slug)).map((slug) => `docs/en/${slug}.md`), ...[...en].filter((slug) => !es.has(slug)).map((slug) => `docs/${slug}.md`)];
if (missing.length) throw new Error(`Faltan traducciones de la documentación: ${missing.join(', ')}`);

// Las páginas quedan un nivel por debajo de su carpeta, así que los enlaces
// relativos suben uno para otra página y depth + 1 para los esquemas JSON.
// El resto apunta al archivo en GitHub.
function rewriteLink(target, source, slugs, depth) {
	if (/^(https?:|mailto:|#)/.test(target)) return target;
	const [file, hash = ''] = target.split('#');
	const anchor = hash ? `#${hash}` : '';
	const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(source), file));
	if (slugs.has(resolved)) return `../${slugs.get(resolved)}/${anchor}`;
	if (path.posix.dirname(resolved) === 'docs' && resolved.endsWith('.json') && files.includes(path.posix.basename(resolved))) {
		return `${'../'.repeat(depth + 1)}schemas/${path.posix.basename(resolved)}`;
	}
	return repoBlob + resolved + anchor;
}
