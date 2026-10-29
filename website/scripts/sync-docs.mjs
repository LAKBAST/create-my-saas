// Copia ../docs/*.md al sitio para que docs/ siga siendo la única fuente de
// verdad. El resultado está en .gitignore: edita siempre los archivos de docs/.
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const website = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDir = path.join(website, '..', 'docs');
const pagesDir = path.join(website, 'src', 'content', 'docs', 'referencia');
const schemasDir = path.join(website, 'public', 'schemas');
const repoBlob = 'https://github.com/LAKBAST/create-my-saas/blob/main/';

const files = await readdir(sourceDir);
await mkdir(pagesDir, { recursive: true });
await rm(schemasDir, { recursive: true, force: true });
await mkdir(schemasDir, { recursive: true });

for (const existing of await readdir(pagesDir)) {
	await rm(path.join(pagesDir, existing));
}

for (const file of files) {
	if (file.endsWith('.json')) {
		await copyFile(path.join(sourceDir, file), path.join(schemasDir, file));
		continue;
	}
	if (!file.endsWith('.md')) continue;

	const markdown = await readFile(path.join(sourceDir, file), 'utf8');
	const match = markdown.match(/^#\s+(.+)\r?\n/);
	if (!match) throw new Error(`docs/${file} debe empezar por un título "# ..."`);

	const body = markdown
		.slice(match[0].length)
		.replace(/\]\(([^)\s]+)\)/g, (link, target) => `](${rewriteLink(target)})`);
	const editUrl = `https://github.com/LAKBAST/create-my-saas/edit/main/docs/${file}`;
	const frontmatter = [
		'---',
		`title: ${JSON.stringify(match[1].trim())}`,
		`editUrl: ${editUrl}`,
		'---',
		'',
	].join('\n');
	await writeFile(path.join(pagesDir, file), frontmatter + body);
}

// Las páginas quedan en /referencia/<slug>/, así que los enlaces relativos
// suben un nivel: ../otra/ para otra página y ../../schemas/ para los JSON.
function rewriteLink(target) {
	if (/^(https?:|mailto:|#)/.test(target)) return target;
	const [file, hash = ''] = target.split('#');
	const anchor = hash ? `#${hash}` : '';
	const name = path.posix.basename(file);
	const local = !file.includes('/') || file.startsWith('./');
	if (local && name.endsWith('.md') && files.includes(name)) {
		return `../${name.slice(0, -3)}/${anchor}`;
	}
	if (local && name.endsWith('.json') && files.includes(name)) {
		return `../../schemas/${name}`;
	}
	return repoBlob + path.posix.normalize(path.posix.join('docs', file)) + anchor;
}
