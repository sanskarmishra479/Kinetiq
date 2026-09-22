import type {Redis} from 'ioredis';

// NFR-SCALE-06: BullMQ silently loses jobs if Redis evicts keys under memory
// pressure. Refuse to start unless the eviction policy is "noeviction".

export class UnsafeRedisPolicy extends Error {
	constructor(policy: string) {
		super(`Redis maxmemory-policy is "${policy}"; it must be "noeviction" (BullMQ would lose jobs).`);
		this.name = 'UnsafeRedisPolicy';
	}
}

/**
 * Throws UnsafeRedisPolicy for any other policy. Some managed Redis services
 * block the CONFIG command; then we can't check, so we return "unknown" and
 * the caller logs a warning (the policy must be set in the provider's dashboard).
 */
export async function assertRedisNoEviction(redis: Redis): Promise<'noeviction' | 'unknown'> {
	let reply: unknown;
	try {
		reply = await redis.config('GET', 'maxmemory-policy');
	} catch {
		return 'unknown';
	}
	const policy = Array.isArray(reply) ? String(reply[1] ?? '') : '';
	if (policy !== 'noeviction') throw new UnsafeRedisPolicy(policy || 'unset');
	return 'noeviction';
}
