export const site = {
	name: 'create-my-saas',
	description:
		'CLI open source para generar un SaaS con backend y frontend versionados. Un proyecto de LAKBAST.',
	repo: 'https://github.com/LAKBAST/create-my-saas',
	org: 'https://github.com/LAKBAST',
	lakbast: 'https://lakbast.com',
	npm: 'https://www.npmjs.com/package/@soymanolo/create-my-saas',
	command: 'npx @soymanolo/create-my-saas@latest my-saas --backend nestjs --frontend nextjs',
};

// Índice de la documentación. Cada slug es la ruta de un Markdown en
// src/content/docs; el título se toma de la propia página.
export const docsNav = [
	{ label: 'Empezar', items: ['empezar/introduccion', 'empezar/instalacion', 'empezar/quick-start'] },
	{
		label: 'Guías',
		items: [
			'guias/plantillas',
			'referencia/product-models',
			'referencia/admin-dashboard',
			'referencia/upgrading',
			'referencia/deployment',
			'referencia/troubleshooting',
		],
	},
	{
		label: 'Referencia',
		items: [
			'referencia/cli-usage',
			'referencia/api-contract',
			'referencia/template-manifests',
			'referencia/extension-manifests',
			'referencia/template-parity',
		],
	},
	{
		label: 'Contribuir',
		items: ['referencia/contributing', 'referencia/development', 'referencia/project'],
	},
	{ label: 'Mantenimiento', items: ['referencia/releasing'] },
];

/** Ruta con el prefijo de despliegue (BASE_PATH). */
export const url = (path = '') => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
