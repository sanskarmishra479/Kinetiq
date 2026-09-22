import {describe, expect, it, vi} from 'vitest';
import {
	consoleEmail,
	dependencyHealth,
	fakeCaptcha,
	memoryEmail,
	memoryLocks,
	resendEmail,
	turnstileCaptcha,
} from './misc.js';

const okResponse = (body: unknown = {}) => new Response(JSON.stringify(body), {status: 200});

describe('resendEmail', () => {
	it('sends the login link with our API key', async () => {
		const http = vi.fn(async () => okResponse({id: 'em_1'}));
		await resendEmail('re_key', 'Kinetiq <hello@kinetiq.so>', http).send({
			template: 'magicLink',
			to: 'asha@acme.com',
			url: 'https://api.kinetiq.so/api/auth/magic-link/verify?token=t',
		});
		const [url, init] = http.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://api.resend.com/emails');
		expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_key');
		const body = JSON.parse(String(init.body));
		expect(body).toMatchObject({
			from: 'Kinetiq <hello@kinetiq.so>',
			to: ['asha@acme.com'],
			subject: 'Your Kinetiq login link',
		});
		expect(body.text).toContain('token=t');
	});

	it('sends plain notices and fails loudly on provider errors', async () => {
		const http = vi.fn(async () => new Response('nope', {status: 500}));
		await expect(
			resendEmail('k', 'f', http).send({template: 'notice', to: 'a@b.com', subject: 'Hi', text: 'Hello'}),
		).rejects.toThrow('Email provider returned 500');
	});
});

describe('turnstileCaptcha', () => {
	it('accepts only a successful verification', async () => {
		const good = vi.fn(async () => okResponse({success: true}));
		expect(await turnstileCaptcha('secret', good).verify('tok', '1.2.3.4')).toBe(true);
		const sent = good.mock.calls[0] as unknown as [string, RequestInit];
		expect(String(sent[1].body)).toContain('remoteip=1.2.3.4');
		expect(
			await turnstileCaptcha(
				'secret',
				vi.fn(async () => okResponse({success: false})),
			).verify('tok', undefined),
		).toBe(false);
		expect(
			await turnstileCaptcha(
				'secret',
				vi.fn(async () => new Response('', {status: 500})),
			).verify('tok', undefined),
		).toBe(false);
	});

	it('rejects a missing token without calling Cloudflare', async () => {
		const http = vi.fn(async () => okResponse({success: true}));
		expect(await turnstileCaptcha('secret', http).verify(undefined, undefined)).toBe(false);
		expect(http).not.toHaveBeenCalled();
	});

	it('fake captcha accepts any token except "fail"', async () => {
		expect(await fakeCaptcha().verify('ok', undefined)).toBe(true);
		expect(await fakeCaptcha().verify('fail', undefined)).toBe(false);
		expect(await fakeCaptcha().verify(undefined, undefined)).toBe(false);
	});
});

describe('email fakes, locks and health', () => {
	it('memory and console email', async () => {
		const mem = memoryEmail();
		await mem.send({template: 'notice', to: 'a@b.com', subject: 's', text: 't'});
		expect(mem.sent).toHaveLength(1);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await consoleEmail().send({template: 'magicLink', to: 'a@b.com', url: 'http://x'});
		await consoleEmail().send({template: 'notice', to: 'a@b.com', subject: 's', text: 't'});
		expect(warn).toHaveBeenCalledTimes(2);
		warn.mockRestore();
	});

	it('locks can be held once and released', async () => {
		const locks = memoryLocks();
		const release = await locks.acquire('k', 1000);
		expect(release).not.toBeNull();
		expect(await locks.acquire('k', 1000)).toBeNull();
		await release?.();
		expect(await locks.acquire('k', 1000)).not.toBeNull();
	});

	it('reports which dependencies are down', async () => {
		const health = dependencyHealth({
			database: async () => 1,
			redis: async () => {
				throw new Error('ECONNREFUSED');
			},
		});
		expect(await health.check()).toEqual(['redis']);
	});
});
