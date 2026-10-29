import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

export const collections = {
	docs: defineCollection({
		loader: glob({ base: './src/content/docs', pattern: '**/*.md' }),
		schema: z.object({
			title: z.string(),
			description: z.string().optional(),
			// Archivo de GitHub que se edita desde el enlace del pie de la página.
			// Por defecto, el propio Markdown dentro de website/.
			editUrl: z.string().url().optional(),
		}),
	}),
};
