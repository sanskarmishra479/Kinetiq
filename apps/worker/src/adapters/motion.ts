import type {StoragePort} from '@kinetiq/platform';
import pixelmatch from 'pixelmatch';
import {PNG} from 'pngjs';

// Measures how much of the picture changes between two frames of a scene,
// for the "something is always moving" check (docs/TODO.md Phase 8).

export interface MotionPort {
	/** Share of pixels (0…1) that differ between two stored PNG frames. */
	changedRatio(firstKey: string, secondKey: string): Promise<number>;
}

/** Pure: compares two PNG images of the same size. */
export function changedRatio(first: Uint8Array, second: Uint8Array): number {
	const a = PNG.sync.read(Buffer.from(first));
	const b = PNG.sync.read(Buffer.from(second));
	if (a.width !== b.width || a.height !== b.height) return 1;
	// A per-pixel threshold of 0.08 ignores encoder noise but catches a slow camera drift.
	const changed = pixelmatch(a.data, b.data, undefined, a.width, a.height, {threshold: 0.08});
	return changed / (a.width * a.height);
}

export function pngMotion(storage: StoragePort): MotionPort {
	const read = async (key: string) => {
		const head = await storage.head(key);
		if (!head) throw new Error(`still ${key} is missing`);
		return storage.readStart(key, head.size);
	};
	return {
		async changedRatio(firstKey, secondKey) {
			const [a, b] = await Promise.all([read(firstKey), read(secondKey)]);
			return changedRatio(a, b);
		},
	};
}

/** Tests that aren't about motion: every scene counts as moving. */
export const alwaysMoving = (): MotionPort => ({changedRatio: async () => 1});
