import {sniffMime} from '@kinetiq/domain';
import type {StoragePort} from '@kinetiq/platform';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {ScrapedSite, ScraperPort} from '../../ports.js';
import {call, Gate, ProviderError, type Fetch} from './http.js';

// Reads the user's website through Firecrawl (docs/ARCHITECTURE.md §5).
// Security (NFR-SEC-05): the user's URL only ever goes to Firecrawl; our
// servers never fetch it. The one thing we download is the screenshot, from
// the https link Firecrawl returns, and we check it really is an image.
// The site's logo URL is NOT fetched: the site controls it, so fetching it
// from our worker would let a site make us call arbitrary addresses (SSRF).

const ENDPOINT = 'https://api.firecrawl.dev/v2/scrape';
const MAX_SCREENSHOT_BYTES = 15 * 1024 * 1024;
/** Rough dollar cost of one Firecrawl credit, for margin tracking (check your plan). */
const USD_PER_CREDIT = 0.001;

const Color = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);

const ScrapeResponse = z.object({
	success: z.boolean().optional(),
	data: z.object({
		markdown: z.string().optional(),
		screenshot: z.string().optional(),
		metadata: z.object({title: z.string().optional(), description: z.string().optional()}).loose().optional(),
		branding: z
			.object({
				colors: z.record(z.string(), z.unknown()).optional(),
				// Fonts come back as names or as {family} objects, depending on the page.
				fonts: z.array(z.union([z.string(), z.object({family: z.string()}).loose()])).optional(),
			})
			.loose()
			.optional(),
	}),
});

/** Brand colors in a stable order: primary first, then the rest, hex only, no duplicates. */
export function brandColors(colors: Record<string, unknown> | undefined): string[] {
	if (!colors) return [];
	const order = ['background', 'primary', 'accent', 'secondary', 'text'];
	const keys = [...order.filter((k) => k in colors), ...Object.keys(colors).filter((k) => !order.includes(k))];
	const found = keys
		.map((k) => colors[k])
		.filter((c): c is string => typeof c === 'string' && Color.safeParse(c).success);
	return [...new Set(found.map((c) => c.toLowerCase()))].slice(0, 8);
}

export type FirecrawlOptions = {
	apiKey: string;
	storage: StoragePort;
	fetch?: Fetch;
	timeoutMs?: number;
	gate?: Gate;
};

export function firecrawlScraper(options: FirecrawlOptions): ScraperPort {
	const fetch = options.fetch ?? globalThis.fetch;
	const gate = options.gate ?? new Gate('firecrawl', {concurrency: 4, failures: 5, coolDownMs: 60_000});
	const http = {provider: 'firecrawl', fetch, timeoutMs: options.timeoutMs ?? 90_000, gate};

	/** Downloads Firecrawl's screenshot and stores it; returns null if it isn't a usable image. */
	async function keepScreenshot(url: string, pageUrl: string): Promise<string | null> {
		if (!url.startsWith('https://')) return null;
		const response = await call(http, url, {method: 'GET'});
		const size = Number(response.headers.get('content-length') ?? 0);
		if (size > MAX_SCREENSHOT_BYTES) return null;
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.length > MAX_SCREENSHOT_BYTES) return null;
		const mime = sniffMime(bytes);
		if (mime !== 'image/png' && mime !== 'image/jpeg' && mime !== 'image/webp') return null;
		const host = new URL(pageUrl).hostname.replace(/^www\./, '');
		const key = `scrape/${host}/${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.${mime.split('/')[1]}`;
		await options.storage.putObject(key, bytes, mime);
		return key;
	}

	return {
		async scrape(url) {
			const response = await call(http, ENDPOINT, {
				method: 'POST',
				headers: {authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json'},
				body: JSON.stringify({
					url,
					formats: ['markdown', 'screenshot', 'branding'],
					onlyMainContent: false,
					timeout: 60_000,
				}),
			});
			const parsed = ScrapeResponse.safeParse(await response.json());
			if (!parsed.success || parsed.data.success === false) {
				throw new ProviderError('firecrawl', null, 'the page could not be read', false);
			}
			const {markdown = '', screenshot, metadata, branding} = parsed.data.data;
			const screenshotKey = screenshot ? await keepScreenshot(screenshot, url).catch(() => null) : null;

			const result: ScrapedSite = {
				title: metadata?.title ?? '',
				description: metadata?.description ?? '',
				markdown,
				colors: brandColors(branding?.colors),
				fonts: (branding?.fonts ?? []).map((f) => (typeof f === 'string' ? f : f.family)).slice(0, 4),
				screenshots: screenshotKey ? [{key: screenshotKey, section: 'home'}] : [],
				logoKey: null,
			};
			// One credit per page; the screenshot and branding formats may cost more on some plans.
			return {result, cost: {provider: 'firecrawl', units: 1, usdMicros: Math.round(USD_PER_CREDIT * 1_000_000)}};
		},
	};
}
