// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// El sitio se publica en la raíz del dominio propio; las variables permiten
// adaptar el origen y la ruta base para otros despliegues.
const site = process.env.SITE_URL ?? 'https://createmysaas.dev';
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
	site,
	base,
	trailingSlash: 'always',
	integrations: [sitemap()],
	markdown: {
		// Cada token lleva su color claro y oscuro; global.css elige según el tema.
		shikiConfig: {
			themes: { light: 'github-light', dark: 'github-dark' },
			defaultColor: false,
			wrap: true,
		},
	},
});
