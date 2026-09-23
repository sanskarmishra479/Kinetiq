import type {Request, RequestHandler, Response} from 'express';
import {AppError} from '../errors.js';
import type {RateLimitPort, RateLimitResult, RateLimitRule} from '../ports.js';

// Rate limits (NFR-SEC-03). Defaults follow docs/API.md §17.
export const RULES = {
	authIp: {name: 'auth-ip', points: 10, durationSec: 60},
	magicLinkEmail: {name: 'magic-link-email', points: 3, durationSec: 3600},
	apiUser: {name: 'api-user', points: 120, durationSec: 60},
	apiIp: {name: 'api-ip', points: 300, durationSec: 60},
	uploadsUser: {name: 'uploads-user', points: 30, durationSec: 3600},
	/** Free-text chat messages per user per day: they call AI models once edits exist (NFR-COST-04). */
	chatUserDaily: {name: 'chat-user-daily', points: 100, durationSec: 24 * 3600},
} satisfies Record<string, RateLimitRule>;

export function setRateLimitHeaders(res: Response, result: RateLimitResult) {
	res.setHeader('RateLimit-Limit', String(result.limit));
	res.setHeader('RateLimit-Remaining', String(result.remaining));
	res.setHeader('RateLimit-Reset', String(result.resetSec));
}

export function tooManyRequests(result: Extract<RateLimitResult, {allowed: false}>) {
	return new AppError('RATE_LIMITED', 'Too many requests, please slow down.', undefined, {
		'Retry-After': String(result.retryAfterSec),
	});
}

/** Limits by a key derived from the request (IP, user, …). A null key skips the check. */
export function rateLimit(
	limiter: RateLimitPort,
	rule: RateLimitRule,
	keyOf: (req: Request) => string | null,
): RequestHandler {
	return async (req, res, next) => {
		try {
			const key = keyOf(req);
			if (key === null) return next();
			const result = await limiter.consume(rule, key);
			setRateLimitHeaders(res, result);
			if (!result.allowed) return next(tooManyRequests(result));
			next();
		} catch (error) {
			next(error);
		}
	};
}

export const byIp = (req: Request) => `ip:${req.ip ?? 'unknown'}`;
export const byUser = (req: Request) => (req.auth ? `user:${req.auth.userId}` : null);
