import { lp, type Lang } from './i18n';

export const site = {
	name: 'create-my-saas',
	repo: 'https://github.com/LAKBAST/create-my-saas',
	org: 'https://github.com/LAKBAST',
	lakbast: 'https://lakbast.com',
	npm: 'https://www.npmjs.com/package/@lakbast/create-my-saas',
	store: 'https://tienda.lakbast.com/store',
	command: 'npx @lakbast/create-my-saas@latest my-saas --backend nestjs --frontend nextjs',
};

// Índice de la documentación. Cada página tiene su ruta en español y en inglés:
// la de un Markdown en src/content/docs y en src/content/docs/en. El título se
// toma de la propia página.
type Page = Record<Lang, string>;
const reference = (slug: string): Page => ({ es: `referencia/${slug}`, en: `reference/${slug}` });

export const docsNav: Array<{ label: Record<Lang, string>; items: Page[] }> = [
	{
		label: { es: 'Empezar', en: 'Get started' },
		items: [
			{ es: 'empezar/introduccion', en: 'getting-started/introduction' },
			{ es: 'empezar/instalacion', en: 'getting-started/installation' },
			{ es: 'empezar/quick-start', en: 'getting-started/quick-start' },
		],
	},
	{
		label: { es: 'Guías', en: 'Guides' },
		items: [
			{ es: 'guias/plantillas', en: 'guides/templates' },
			reference('product-models'),
			reference('admin-dashboard'),
			reference('upgrading'),
			reference('deployment'),
			reference('troubleshooting'),
		],
	},
	{
		label: { es: 'Referencia', en: 'Reference' },
		items: [
			reference('cli-usage'),
			reference('api-contract'),
			reference('template-manifests'),
			reference('extension-manifests'),
			reference('template-parity'),
		],
	},
	{
		label: { es: 'Contribuir', en: 'Contributing' },
		items: [reference('contributing'), reference('development'), reference('project')],
	},
	{ label: { es: 'Mantenimiento', en: 'Maintenance' }, items: [reference('releasing')] },
];

/** Páginas de documentación enlazadas desde la cabecera y el pie. */
export const docLinks = {
	home: docsNav[0].items[0],
	quickStart: docsNav[0].items[2],
	templates: docsNav[1].items[0],
	cli: reference('cli-usage'),
	contributing: reference('contributing'),
};

/** Ruta con el prefijo de despliegue (BASE_PATH). */
export const url = (path = '') => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

/** URL de una página de la documentación en un idioma. */
export const docUrl = (lang: Lang, page: Page) => url(lp(lang, `${page[lang]}/`));
