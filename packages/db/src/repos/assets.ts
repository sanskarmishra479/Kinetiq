import type {Asset, CreateUploadRequest} from '@kinetiq/shared';
import type {Asset as AssetRow} from '../generated/prisma/client.js';
import {iso, type RepoDeps} from './shared.js';

// Uploaded files. The storage key is always generated here from the user and
// asset ids, never taken from the client (NFR-SEC-10, FR-PRJ-05).

function toAsset(row: AssetRow): Asset {
	return {
		id: row.id,
		kind: row.kind,
		mime: row.mime as Asset['mime'],
		size: row.size,
		status: row.status,
		createdAt: iso(row.createdAt),
	};
}

export const storageKeyFor = (userId: string, assetId: string) => `u/${userId}/${assetId}`;

export function assetsRepo({db, ids, clock}: RepoDeps) {
	return {
		/** Creates the pending record before the browser uploads. Returns the server-chosen key. */
		async createPending(userId: string, req: CreateUploadRequest) {
			const id = ids.next('ast');
			const row = await db.asset.create({
				data: {
					id,
					userId,
					kind: req.kind,
					mime: req.mime,
					size: req.size,
					filename: req.filename,
					storageKey: storageKeyFor(userId, id),
					createdAt: new Date(clock.now()),
				},
			});
			return {asset: toAsset(row), storageKey: row.storageKey};
		},

		/** Internal view (includes the storage key) for the upload-complete check. Scoped by user. */
		async getForUpload(userId: string, assetId: string) {
			return db.asset.findFirst({where: {id: assetId, userId}});
		},

		async get(userId: string, assetId: string): Promise<Asset | null> {
			const row = await db.asset.findFirst({where: {id: assetId, userId}});
			return row ? toAsset(row) : null;
		},

		/** pending → ready (images, DESIGN.md) or processing → ready (videos, after the worker's probe). */
		async markReady(
			userId: string,
			assetId: string,
			facts: {sha256?: string | null; durationSec?: number | null} = {},
		) {
			const {count} = await db.asset.updateMany({
				where: {id: assetId, userId, status: {in: ['pending', 'processing']}},
				data: {status: 'ready', sha256: facts.sha256 ?? null, durationSec: facts.durationSec ?? null},
			});
			return count > 0;
		},

		/** pending → processing: uploaded video waiting for the worker's ffprobe check. */
		async markProcessing(userId: string, assetId: string) {
			const {count} = await db.asset.updateMany({
				where: {id: assetId, userId, status: 'pending'},
				data: {status: 'processing'},
			});
			return count > 0;
		},

		async markRejected(userId: string, assetId: string) {
			const {count} = await db.asset.updateMany({where: {id: assetId, userId}, data: {status: 'rejected'}});
			return count > 0;
		},

		/**
		 * True only if every id exists, belongs to this user, is ready and isn't
		 * already attached to another project. Used before creating a project.
		 */
		async allUsable(userId: string, assetIds: readonly string[]): Promise<boolean> {
			if (assetIds.length === 0) return true;
			const count = await db.asset.count({
				where: {id: {in: [...assetIds]}, userId, status: 'ready', projectId: null},
			});
			return count === new Set(assetIds).size;
		},
	};
}
