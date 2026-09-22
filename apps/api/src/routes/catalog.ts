import {CREDIT_PACKS, DESIGN_PRESETS, PLANS, VOICES} from '@kinetiq/shared';
import {Router, type Response} from 'express';
import type {Container} from '../container.js';
import {notFound} from '../errors.js';

// Public catalog (docs/API.md §10). Cacheable at the CDN: the same for everyone.

const cache = (res: Response, seconds: number) =>
	res.setHeader('Cache-Control', `public, max-age=${seconds}, s-maxage=${seconds}, stale-while-revalidate=60`);

export function catalogRoutes({config, repos}: Container): Router {
	const router = Router();
	const cdn = (key: string) => `${config.PUBLIC_CDN_ORIGIN}/${key}`;

	router.get('/voices', (_req, res) => {
		cache(res, 3600);
		res.json({items: VOICES.map(({previewKey, ...voice}) => ({...voice, previewUrl: cdn(previewKey)}))});
	});

	router.get('/design-presets', (_req, res) => {
		cache(res, 3600);
		res.json({items: DESIGN_PRESETS});
	});

	router.get('/billing/plans', (_req, res) => {
		cache(res, 300);
		res.json({plans: PLANS, packs: CREDIT_PACKS});
	});

	router.get('/templates', async (_req, res) => {
		cache(res, 300);
		const items = await repos.templates.listPublished();
		res.json({
			items: items.map(({previewKey, posterKey, ...t}) => ({
				...t,
				previewUrl: cdn(previewKey),
				posterUrl: cdn(posterKey),
			})),
		});
	});

	router.get('/templates/:slug', async (req, res) => {
		const found = await repos.templates.getPublishedBySlug(String(req.params.slug));
		if (!found) throw notFound('Template not found');
		cache(res, 300);
		const {previewKey, posterKey, ...t} = found.template;
		res.json({template: {...t, previewUrl: cdn(previewKey), posterUrl: cdn(posterKey)}, slots: found.slots});
	});

	return router;
}
