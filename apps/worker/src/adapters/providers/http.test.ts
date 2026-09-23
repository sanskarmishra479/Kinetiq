import {describe, expect, it} from 'vitest';
import {fakeFetch, json} from './fake-fetch.js';
import {call, Gate, ProviderDegraded, ProviderError} from './http.js';

const gate = () => new Gate('acme', {concurrency: 2, failures: 3, coolDownMs: 1000});
const options = (fetch: ReturnType<typeof fakeFetch>, g = gate()) => ({
	provider: 'acme',
	fetch,
	timeoutMs: 1000,
	gate: g,
});

describe('call', () => {
	it('returns successful responses', async () => {
		const fetch = fakeFetch([json({ok: true})]);
		const response = await call(options(fetch), 'https://api.acme.test/x', {method: 'POST', body: '{}'});
		expect(await response.json()).toEqual({ok: true});
	});

	it('marks rate limits, server errors and network failures as worth retrying, and bad requests as not', async () => {
		const cases = [
			[json({error: {message: 'slow down'}}, 429), true, /HTTP 429: slow down/],
			[json({message: 'boom'}, 503), true, /HTTP 503: boom/],
			[json({error: 'bad key'}, 401), false, /HTTP 401: bad key/],
			[new Response('not json', {status: 402}), false, /HTTP 402$/],
			[new TypeError('fetch failed'), true, /network error/],
			[new DOMException('timed out', 'TimeoutError'), true, /timed out after 1000 ms/],
		] as const;
		for (const [reply, retryable, message] of cases) {
			const error = await call(options(fakeFetch([reply as never])), 'https://api.acme.test/x', {}).catch(
				(e: unknown) => e,
			);
			expect(error).toBeInstanceOf(ProviderError);
			expect(error).toMatchObject({provider: 'acme', retryable});
			expect((error as Error).message).toMatch(message);
		}
	});
});

describe('Gate', () => {
	it('runs at most `concurrency` calls at once', async () => {
		const g = gate();
		let running = 0;
		let peak = 0;
		const task = () =>
			g.run(async () => {
				running++;
				peak = Math.max(peak, running);
				await new Promise((r) => setTimeout(r, 5));
				running--;
			});
		await Promise.all(Array.from({length: 6}, task));
		expect(peak).toBe(2);
	});

	it('opens after repeated retryable failures, fails fast, then recovers (NFR-REL-03)', async () => {
		let now = 0;
		const g = new Gate('acme', {concurrency: 1, failures: 2, coolDownMs: 1000, now: () => now});
		const fail = () => g.run(async () => Promise.reject(new ProviderError('acme', 503, 'down', true)));
		await expect(fail()).rejects.toThrow(/down/);
		await expect(fail()).rejects.toThrow(/down/);
		await expect(g.run(async () => 'ok')).rejects.toBeInstanceOf(ProviderDegraded);
		now = 1500;
		expect(await g.run(async () => 'ok')).toBe('ok');
	});

	it('does not open for permanent errors (a bad request is not an outage)', async () => {
		const g = new Gate('acme', {concurrency: 1, failures: 1, coolDownMs: 1000});
		await expect(g.run(async () => Promise.reject(new ProviderError('acme', 400, 'bad', false)))).rejects.toThrow();
		expect(await g.run(async () => 'ok')).toBe('ok');
	});
});
