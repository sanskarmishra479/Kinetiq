import {createHash} from 'node:crypto';
import type {RequestHandler} from 'express';
import {AppError} from '../errors.js';
import type {LockPort} from '../ports.js';

// Idempotency-Key support (docs/API.md §1, FR-CHAT-04, NFR-SEC-16).
// - The key is scoped to the user, so users can't read each other's responses.
// - Replaying the same key with the same body returns the stored response.
// - The same key with a different body is rejected (409 IDEMPOTENCY_MISMATCH).
// - A lock stops two identical requests running at the same time.
// - Only non-5xx responses are stored, so failures can be retried.

export type IdempotencyStore = {
	find(userId: string, key: string): Promise<{requestHash: string; status: number; body: unknown} | null>;
	save(userId: string, key: string, record: {requestHash: string; status: number; body: unknown}): Promise<boolean>;
};

const KEY = /^[A-Za-z0-9_-]{16,64}$/;
const LOCK_MS = 30_000;

export function requestHash(method: string, path: string, body: unknown): string {
	return createHash('sha256')
		.update(`${method}\n${path}\n${JSON.stringify(body ?? null)}`)
		.digest('hex');
}

/** Requires an authenticated request (place after requireAuth). */
export function idempotent(store: IdempotencyStore, locks: LockPort): RequestHandler {
	return async (req, res, next) => {
		try {
			const userId = req.auth?.userId;
			if (!userId) throw new AppError('UNAUTHENTICATED', 'Log in first');
			const key = req.header('idempotency-key');
			if (!key || !KEY.test(key)) {
				throw new AppError(
					'VALIDATION_ERROR',
					'An Idempotency-Key header (16–64 letters, digits, - or _) is required',
					{
						fields: {'idempotency-key': 'required'},
					},
				);
			}
			const hash = requestHash(req.method, req.baseUrl + req.path, req.body);

			const existing = await store.find(userId, key);
			if (existing) {
				if (existing.requestHash !== hash) {
					throw new AppError('IDEMPOTENCY_MISMATCH', 'This Idempotency-Key was already used for a different request');
				}
				res.setHeader('Idempotent-Replayed', 'true');
				res.status(existing.status).json(existing.body);
				return;
			}

			const release = await locks.acquire(`idem:${userId}:${key}`, LOCK_MS);
			if (!release) throw new AppError('CONFLICT', 'A request with this Idempotency-Key is already in progress');

			const json = res.json.bind(res);
			res.json = (body: unknown) => {
				if (res.statusCode < 500) {
					void store
						.save(userId, key, {requestHash: hash, status: res.statusCode, body})
						.catch((err: unknown) => req.log?.error({err}, 'idempotency save failed'))
						.finally(() => void release());
				} else {
					void release();
				}
				return json(body);
			};
			next();
		} catch (error) {
			next(error);
		}
	};
}
