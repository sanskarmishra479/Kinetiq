import {looksLikeText, sniffMime, SNIFF_BYTES} from '@kinetiq/domain';
import {CreateUploadRequest, UPLOAD_RULES, type CreateUploadResponse, type UploadMime} from '@kinetiq/shared';
import {Router} from 'express';
import type {Container} from '../container.js';
import {AppError, notFound} from '../errors.js';
import {rateLimit, RULES} from '../middleware/rate-limit.js';
import {requireAuth} from '../middleware/session.js';

// Uploads (docs/API.md §9, FR-PRJ-04/05, NFR-SEC-10).
// 1. POST /v1/uploads           → the server picks the storage key and returns a presigned PUT
// 2. the browser uploads directly to storage
// 3. POST /v1/uploads/:id/complete → the server checks the real size and the file's
//    bytes; anything that doesn't match is deleted and rejected.

const PUT_EXPIRES_SEC = 10 * 60;

export function uploadRoutes({repos, storage, rateLimiter, queues}: Container): Router {
	const router = Router();

	router.post(
		'/uploads',
		requireAuth,
		rateLimit(rateLimiter, RULES.uploadsUser, (req) => `user:${req.auth!.userId}`),
		async (req, res) => {
			const input = CreateUploadRequest.parse(req.body);
			const {asset, storageKey} = await repos.assets.createPending(req.auth!.userId, input);
			const put = await storage.presignPut(storageKey, {contentType: input.mime, expiresSec: PUT_EXPIRES_SEC});
			const body: CreateUploadResponse = {
				assetId: asset.id,
				upload: {method: 'PUT', url: put.url, headers: put.headers},
				expiresAt: put.expiresAt.toISOString(),
			};
			res.status(201).json(body);
		},
	);

	router.post('/uploads/:assetId/complete', requireAuth, async (req, res) => {
		const userId = req.auth!.userId;
		const row = await repos.assets.getForUpload(userId, String(req.params.assetId));
		if (!row) throw notFound('Upload not found');
		if (row.status !== 'pending') {
			// Already checked: completing twice is harmless.
			res.json({asset: await repos.assets.get(userId, row.id)});
			return;
		}

		const reject = async (message: string): Promise<never> => {
			await storage.delete(row.storageKey);
			await repos.assets.markRejected(userId, row.id);
			throw new AppError('VALIDATION_ERROR', message, {fields: {file: message}});
		};

		const head = await storage.head(row.storageKey);
		if (!head)
			throw new AppError('VALIDATION_ERROR', 'The file has not been uploaded yet', {fields: {file: 'missing'}});
		const rule = UPLOAD_RULES[row.mime as UploadMime];
		if (head.size !== row.size || head.size > rule.maxBytes) {
			await reject('The uploaded file size does not match');
		}

		const firstBytes = await storage.readStart(row.storageKey, rule.kind === 'text' ? rule.maxBytes : SNIFF_BYTES);
		if (rule.kind === 'text') {
			if (!looksLikeText(firstBytes)) await reject('The file is not a text file');
		} else if (sniffMime(firstBytes) !== row.mime) {
			await reject('The file content does not match its type');
		}

		// Videos wait for the worker's ffprobe check before they can be used (FR-PRJ-04).
		if (rule.kind === 'video') {
			await repos.assets.markProcessing(userId, row.id);
			await queues.enqueue(
				'maintenance',
				{kind: 'probe-asset', userId, assetId: row.id},
				{jobId: `probe-${row.id}`, attempts: 3},
			);
		} else {
			await repos.assets.markReady(userId, row.id);
		}
		res.json({asset: await repos.assets.get(userId, row.id)});
	});

	return router;
}
