import type {Redis} from 'ioredis';

// A tiny expiring key/value store: the research cache (FR-GEN-12) and other
// short-lived data. Every key has a TTL (NFR-SCALE-06).

export interface KvPort {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ttlSec: number): Promise<void>;
}

export const redisKv = (redis: Redis, prefix = 'kv:'): KvPort => ({
	get: (key) => redis.get(prefix + key),
	set: async (key, value, ttlSec) => {
		await redis.set(prefix + key, value, 'EX', ttlSec);
	},
});

/** Tests and local runs: the same behaviour in memory, expiry included. */
export function memoryKv(now: () => number = Date.now): KvPort & {size: () => number} {
	const entries = new Map<string, {value: string; expiresAt: number}>();
	return {
		size: () => entries.size,
		async get(key) {
			const hit = entries.get(key);
			if (!hit) return null;
			if (hit.expiresAt <= now()) {
				entries.delete(key);
				return null;
			}
			return hit.value;
		},
		async set(key, value, ttlSec) {
			entries.set(key, {value, expiresAt: now() + ttlSec * 1000});
		},
	};
}
