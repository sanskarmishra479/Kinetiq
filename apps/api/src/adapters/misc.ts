import {randomUUID} from 'node:crypto';
import type {Redis} from 'ioredis';
import type {CaptchaPort, EmailMessage, EmailPort, HealthPort, LockPort} from '../ports.js';

type Fetch = typeof fetch;

// ── Email ────────────────────────────────────────────────────────────────────

/** Local development: prints the email (including the login link) to stderr. */
export const consoleEmail = (): EmailPort => ({
	async send(message) {
		console.warn(
			`[email:${message.template}] to=${message.to}`,
			message.template === 'magicLink' ? message.url : message.text,
		);
	},
});

/** Tests: keeps every sent email in memory. */
export function memoryEmail(): EmailPort & {sent: EmailMessage[]} {
	const sent: EmailMessage[] = [];
	return {sent, send: async (message) => void sent.push(message)};
}

/** Production: Resend's HTTP API. `fetch` is injectable for tests. */
export function resendEmail(apiKey: string, from: string, http: Fetch = fetch): EmailPort {
	return {
		async send(message) {
			const content =
				message.template === 'magicLink'
					? {
							subject: 'Your Kinetiq login link',
							text: `Click to log in to Kinetiq:\n\n${message.url}\n\nThis link expires in 10 minutes. If you didn't ask for it, ignore this email.`,
						}
					: {subject: message.subject, text: message.text};
			const res = await http('https://api.resend.com/emails', {
				method: 'POST',
				headers: {authorization: `Bearer ${apiKey}`, 'content-type': 'application/json'},
				body: JSON.stringify({from, to: [message.to], ...content}),
			});
			if (!res.ok) throw new Error(`Email provider returned ${res.status}`);
		},
	};
}

// ── Captcha (Cloudflare Turnstile) ───────────────────────────────────────────

export function turnstileCaptcha(secret: string, http: Fetch = fetch): CaptchaPort {
	return {
		async verify(token, ip) {
			if (!token) return false;
			const body = new URLSearchParams({secret, response: token});
			if (ip) body.set('remoteip', ip);
			const res = await http('https://challenges.cloudflare.com/turnstile/v0/siteverify', {method: 'POST', body});
			if (!res.ok) return false;
			const data = (await res.json()) as {success?: unknown};
			return data.success === true;
		},
	};
}

/** Local development and tests: accepts any non-empty token except "fail". */
export const fakeCaptcha = (): CaptchaPort => ({
	verify: async (token) => Boolean(token) && token !== 'fail',
});

// ── Locks ────────────────────────────────────────────────────────────────────

const RELEASE_IF_OWNER =
	"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export function redisLocks(redis: Redis): LockPort {
	return {
		async acquire(key, ttlMs) {
			const token = randomUUID();
			const ok = await redis.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
			if (ok !== 'OK') return null;
			return async () => {
				await redis.eval(RELEASE_IF_OWNER, 1, `lock:${key}`, token);
			};
		},
	};
}

export function memoryLocks(): LockPort {
	const held = new Set<string>();
	return {
		async acquire(key) {
			if (held.has(key)) return null;
			held.add(key);
			return async () => void held.delete(key);
		},
	};
}

// ── Health ───────────────────────────────────────────────────────────────────

export function dependencyHealth(checks: Record<string, () => Promise<unknown>>): HealthPort {
	return {
		async check() {
			const results = await Promise.all(
				Object.entries(checks).map(async ([name, probe]) => {
					try {
						await probe();
						return null;
					} catch {
						return name;
					}
				}),
			);
			return results.filter((r): r is string => r !== null);
		},
	};
}
