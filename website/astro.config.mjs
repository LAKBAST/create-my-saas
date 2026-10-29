// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages sirve el sitio en /create-my-saas. Con un dominio propio,
// define SITE_URL=https://tu-dominio y BASE_PATH=/ en el workflow.
const site = process.env.SITE_URL ?? 'https://lakbast.github.io';
const base = process.env.BASE_PATH ?? '/create-my-saas';

export default defineConfig({
	site,
	base,
	trailingSlash: 'always',
	markdown: {
		// Cada token lleva su color claro y oscuro; global.css elige según el tema.
		shikiConfig: {
			themes: { light: 'github-light', dark: 'github-dark' },
			defaultColor: false,
			wrap: true,
		},
	},
});
