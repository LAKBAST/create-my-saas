// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// GitHub Pages sirve el sitio en /create-my-saas. Con un dominio propio,
// define SITE_URL=https://tu-dominio y BASE_PATH=/ en el workflow.
const site = process.env.SITE_URL ?? 'https://lakbast.github.io';
const base = process.env.BASE_PATH ?? '/create-my-saas';

export default defineConfig({
	site,
	base,
	integrations: [
		starlight({
			title: 'create-my-saas',
			description:
				'Genera un SaaS con backend y frontend versionados desde la terminal.',
			defaultLocale: 'root',
			locales: { root: { label: 'Español', lang: 'es' } },
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/LAKBAST/create-my-saas' },
			],
			editLink: {
				baseUrl: 'https://github.com/LAKBAST/create-my-saas/edit/main/website/',
			},
			lastUpdated: true,
			sidebar: [
				{
					label: 'Empezar',
					items: [
						'empezar/introduccion',
						'empezar/instalacion',
						'empezar/quick-start',
					],
				},
				{
					label: 'Guías',
					items: [
						'guias/plantillas',
						'referencia/product-models',
						'referencia/admin-dashboard',
						'guias/actualizar',
						'referencia/deployment',
					],
				},
				{
					label: 'Referencia',
					items: [
						'referencia/cli',
						'referencia/api-contract',
						'referencia/template-manifests',
						'referencia/extension-manifests',
						'referencia/template-parity',
					],
				},
				{
					label: 'Contribuir',
					items: ['referencia/releasing'],
				},
			],
		}),
	],
});
