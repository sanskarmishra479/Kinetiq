import cors from 'cors';
import type {RequestHandler} from 'express';
import helmet from 'helmet';
import {AppError} from '../errors.js';

// HTTP security headers, CORS and the CSRF Origin check (NFR-SEC-09, NFR-SEC-11).

export function securityHeaders(hsts: boolean): RequestHandler {
	return helmet({
		// The API only returns JSON: nothing may be loaded, framed or executed.
		contentSecurityPolicy: {directives: {defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"]}},
		crossOriginResourcePolicy: {policy: 'same-site'},
		referrerPolicy: {policy: 'no-referrer'},
		strictTransportSecurity: hsts ? {maxAge: 63_072_000, includeSubDomains: true, preload: true} : false,
	});
}

export function corsFor(webOrigin: string): RequestHandler {
	return cors({
		origin: webOrigin,
		credentials: true,
		methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
		allowedHeaders: ['content-type', 'idempotency-key', 'x-turnstile-token', 'last-event-id'],
		exposedHeaders: ['x-request-id', 'retry-after', 'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset'],
		maxAge: 600,
	});
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Rejects state-changing requests that don't come from our web app.
 * Browsers always send Origin on cross-site and same-site POSTs, so a missing
 * or foreign Origin means the request didn't come from kinetiq.so.
 * Webhooks are exempt; they're authenticated by signature instead.
 */
export function originCheck(webOrigin: string, exemptPrefixes: string[] = ['/v1/webhooks/']): RequestHandler {
	return (req, _res, next) => {
		if (SAFE_METHODS.has(req.method) || exemptPrefixes.some((p) => req.path.startsWith(p))) return next();
		if (req.headers.origin !== webOrigin) {
			return next(new AppError('FORBIDDEN', 'Request origin not allowed'));
		}
		next();
	};
}
