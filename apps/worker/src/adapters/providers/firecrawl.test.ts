import {memoryStorage} from '@kinetiq/platform';
import {describe, expect, it} from 'vitest';
import {bytes, fakeFetch, json} from './fake-fetch.js';
import {brandColors, firecrawlScraper} from './firecrawl.js';
import {Gate} from './http.js';

// Contract tests: responses shaped like Firecrawl's v2 scrape API
// (https://docs.firecrawl.dev/api-reference/endpoint/scrape).

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);

const scrapeReply = (overrides: Record<string, unknown> = {}) =>
	json({
		success: true,
		data: {
			markdown: '# FernPay\n\nPayments for marketplaces.',
			screenshot: 'https://storage.firecrawl.test/shots/abc.png',
			metadata: {title: 'FernPay — Payments for marketplaces', description: 'Split payouts and KYC', statusCode: 200},
			branding: {
				colorScheme: 'dark',
				colors: {primary: '#1FBF75', background: '#04140F', text: '#EAFFF5', accent: 'not-a-color'},
				fonts: [{family: 'Geist'}, 'Inter'],
				logo: 'http://169.254.169.254/latest/meta-data',
			},
			...overrides,
		},
	});

const scraper = (fetch: ReturnType<typeof fakeFetch>) => {
	const storage = memoryStorage();
	return {
		storage,
		scraper: firecrawlScraper({
			apiKey: 'fc-test',
			storage,
			fetch,
			gate: new Gate('firecrawl', {concurrency: 2, failures: 5, coolDownMs: 1000}),
		}),
	};
};

describe('firecrawlScraper', () => {
	it('reads the page through Firecrawl and keeps the screenshot', async () => {
		const fetch = fakeFetch([scrapeReply(), bytes(PNG, 'image/png')]);
		const {scraper: s, storage} = scraper(fetch);
		const {result, cost} = await s.scrape('https://www.fernpay.io/');

		expect(fetch.requests[0]).toMatchObject({
			url: 'https://api.firecrawl.dev/v2/scrape',
			method: 'POST',
			headers: {authorization: 'Bearer fc-test'},
			body: {url: 'https://www.fernpay.io/', formats: ['markdown', 'screenshot', 'branding']},
		});
		expect(result).toMatchObject({
			title: 'FernPay — Payments for marketplaces',
			description: 'Split payouts and KYC',
			markdown: '# FernPay\n\nPayments for marketplaces.',
			colors: ['#04140f', '#1fbf75', '#eafff5'],
			fonts: ['Geist', 'Inter'],
			logoKey: null,
		});
		expect(result.screenshots).toHaveLength(1);
		expect(result.screenshots[0]!.key).toMatch(/^scrape\/fernpay\.io\/[0-9a-f]{16}\.png$/);
		expect(storage.has(result.screenshots[0]!.key)).toBe(true);
		expect(cost).toMatchObject({provider: 'firecrawl', units: 1});
	});

	// NFR-SEC-05: only Firecrawl touches the user's URL; the site-controlled logo URL is never fetched.
	it('never fetches the site-controlled logo, and never the user URL itself', async () => {
		const fetch = fakeFetch([scrapeReply(), bytes(PNG, 'image/png')]);
		await scraper(fetch).scraper.scrape('https://fernpay.io');
		expect(fetch.requests.map((r) => r.url)).toEqual([
			'https://api.firecrawl.dev/v2/scrape',
			'https://storage.firecrawl.test/shots/abc.png',
		]);
	});

	it('drops a "screenshot" that is not really an image, or not https', async () => {
		const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
		const fake = await scraper(fakeFetch([scrapeReply(), bytes(html, 'image/png')])).scraper.scrape(
			'https://fernpay.io',
		);
		expect(fake.result.screenshots).toEqual([]);

		const insecure = scrapeReply({screenshot: 'http://storage.firecrawl.test/a.png'});
		const plain = await scraper(fakeFetch([insecure])).scraper.scrape('https://fernpay.io');
		expect(plain.result.screenshots).toEqual([]);
	});

	it('still works when the screenshot download fails', async () => {
		const fetch = fakeFetch([scrapeReply(), json({}, 500)]);
		const {result} = await scraper(fetch).scraper.scrape('https://fernpay.io');
		expect(result.screenshots).toEqual([]);
		expect(result.title).toContain('FernPay');
	});

	it('fails clearly when the page could not be read', async () => {
		const fetch = fakeFetch([json({success: false, error: 'blocked'})]);
		await expect(scraper(fetch).scraper.scrape('https://fernpay.io')).rejects.toMatchObject({
			name: 'ProviderError',
			retryable: false,
		});
		await expect(
			scraper(fakeFetch([json({error: 'Payment required'}, 402)])).scraper.scrape('https://x.io'),
		).rejects.toThrow(/HTTP 402: Payment required/);
	});
});

describe('brandColors', () => {
	it('orders background and primary first, keeps hex only, no duplicates, at most 8', () => {
		expect(
			brandColors({text: '#FFF', primary: '#111111', background: '#000000', extra: '#111111', bad: 'red'}),
		).toEqual(['#000000', '#111111', '#fff']);
		expect(brandColors(undefined)).toEqual([]);
		const many = Object.fromEntries(
			Array.from({length: 12}, (_, i) => [`c${i}`, `#0000${String(i).padStart(2, '0')}`]),
		);
		expect(brandColors(many)).toHaveLength(8);
	});
});
