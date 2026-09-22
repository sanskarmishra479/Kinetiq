import {randomBytes} from 'node:crypto';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {pino, type DestinationStream, type Logger} from 'pino';
import {pinoHttp} from 'pino-http';

// Structured JSON logs with a request id on every line. Logs never contain
// cookies, tokens, emails, query strings or bodies (NFR-SEC-15): requests are
// logged as method + path only, and known secret fields are redacted.

export const REDACT_PATHS = [
	'req.headers.cookie',
	'req.headers.authorization',
	'req.headers["x-turnstile-token"]',
	'res.headers["set-cookie"]',
	'*.email',
	'*.token',
	'*.password',
	'*.secret',
	'*.apiKey',
	'*.url',
	'email',
	'token',
];

export function createLogger(level: string, destination?: DestinationStream): Logger {
	return pino({level, redact: {paths: REDACT_PATHS, censor: '[redacted]'}}, destination);
}

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Accepts a well-formed incoming X-Request-Id (e.g. from the load balancer), else makes one. */
export function requestIdFor(req: IncomingMessage, res: ServerResponse): string {
	const incoming = req.headers['x-request-id'];
	const id =
		typeof incoming === 'string' && REQUEST_ID.test(incoming)
			? incoming
			: `req_${randomBytes(9).toString('base64url')}`;
	res.setHeader('X-Request-Id', id);
	return id;
}

/** Path only: query strings can carry tokens (e.g. magic-link verification). */
export const pathOnly = (url: string | undefined) => (url ?? '').split('?')[0] ?? '';

export function httpLogger(logger: Logger) {
	return pinoHttp({
		logger,
		genReqId: requestIdFor,
		serializers: {
			req: (req: {id: string; method: string; url: string}) => ({
				id: req.id,
				method: req.method,
				path: pathOnly(req.url),
			}),
			res: (res: {statusCode: number}) => ({status: res.statusCode}),
		},
		customProps: (req) => ({userId: (req as {auth?: {userId: string}}).auth?.userId}),
		customLogLevel: (_req, res, err) =>
			err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
	});
}
