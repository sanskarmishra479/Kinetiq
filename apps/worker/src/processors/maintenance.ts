import type {MaintenancePayload} from '@kinetiq/shared';
import type {WorkerContainer} from '../container.js';
import {checkVideo} from '../video-rules.js';

// Background housekeeping (FR-PRJ-04, NFR-LEG-02).

export async function processMaintenance(c: WorkerContainer, payload: MaintenancePayload): Promise<string> {
	switch (payload.kind) {
		case 'probe-asset':
			return probeAsset(c, payload.assetId, payload.userId);
		case 'purge-user-files': {
			const deleted = await c.storage.deletePrefix(`u/${payload.userId}/`);
			return `deleted ${deleted}`;
		}
	}
}

/** processing → ready (with its duration) or rejected (file deleted). */
async function probeAsset({repos, storage, probe}: WorkerContainer, assetId: string, userId: string) {
	const asset = await repos.assets.systemGetForProbe(assetId);
	if (!asset || asset.userId !== userId) return 'skipped';
	if (asset.mime !== 'video/mp4' && asset.mime !== 'video/webm') return 'skipped';

	const url = await storage.presignGet(asset.storageKey, {expiresSec: 120});
	let verdict;
	try {
		verdict = checkVideo(await probe.probe(url, asset.mime));
	} catch {
		verdict = {ok: false as const, reason: 'The video could not be read'};
	}
	if (verdict.ok) {
		await repos.assets.markReady(userId, asset.id, {durationSec: verdict.durationSec});
		return 'ready';
	}
	await storage.delete(asset.storageKey);
	await repos.assets.markRejected(userId, asset.id);
	return `rejected: ${verdict.reason}`;
}
