import {randomUUID} from 'node:crypto';
import {Redis} from 'ioredis';
import {afterAll, describe, expect, it} from 'vitest';
import {redisLocks} from './misc.js';
import {memoryConnectionLimiter, redisConnectionLimiter, redisRateLimiter} from './rate-limit.js';

// The production Redis adapters against the real Redis from docker compose.
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {maxRetriesPerRequest: 1});

afterAll(async () => {
	await redis.quit();
});

describe('redisRateLimiter', () => {
	it('counts per key across calls and blocks with Retry-After (shared by all replicas)', async () => {
		const limiter = redisRateLimiter(redis);
		const rule = {name: `test-${randomUUID()}`, points: 2, durationSec: 60};
		expect(await limiter.consume(rule, 'ip:1.1.1.1')).toMatchObject({allowed: true, remaining: 1, limit: 2});
		expect(await limiter.consume(rule, 'ip:1.1.1.1')).toMatchObject({allowed: true, remaining: 0});
		const blocked = await limiter.consume(rule, 'ip:1.1.1.1');
		expect(blocked.allowed).toBe(false);
		if (!blocked.allowed) expect(blocked.retryAfterSec).toBeGreaterThan(0);
		expect((await limiter.consume(rule, 'ip:2.2.2.2')).allowed).toBe(true);
		// A second limiter instance (another API replica) sees the same counts.
		expect((await redisRateLimiter(redis).consume(rule, 'ip:1.1.1.1')).allowed).toBe(false);
	});

	it('stores counters with an expiry (NFR-SCALE-06)', async () => {
		const rule = {name: `ttl-${randomUUID()}`, points: 5, durationSec: 30};
		await redisRateLimiter(redis).consume(rule, 'user:x');
		const keys = await redis.keys(`rl:${rule.name}*`);
		expect(keys.length).toBe(1);
		const ttl = await redis.pttl(keys[0] ?? '');
		expect(ttl).toBeGreaterThan(0);
		expect(ttl).toBeLessThanOrEqual(30_000);
	});
});

describe('redisLocks', () => {
	it('lets one holder in, releases only its own lock, and expires', async () => {
		const locks = redisLocks(redis);
		const key = `test-${randomUUID()}`;
		const release = await locks.acquire(key, 5_000);
		expect(release).not.toBeNull();
		expect(await locks.acquire(key, 5_000)).toBeNull();
		await release?.();
		const again = await locks.acquire(key, 50);
		expect(again).not.toBeNull();
		await new Promise((r) => setTimeout(r, 80));
		// The first holder's lock expired; a stale release must not remove the new owner's lock.
		const third = await locks.acquire(key, 5_000);
		expect(third).not.toBeNull();
		await again?.();
		expect(await locks.acquire(key, 5_000)).toBeNull();
		await third?.();
	});
});

describe('connection limiter (SSE, 5 per user across replicas)', () => {
	for (const [name, make] of [
		['redis', (now: () => number) => redisConnectionLimiter(redis, now)],
		['memory', (now: () => number) => memoryConnectionLimiter(now)],
	] as const) {
		it(`${name}: caps open connections, frees closed ones and forgets expired leases`, async () => {
			let t = 1_000_000;
			const limiter = make(() => t);
			const user = `usr_${randomUUID().replaceAll('-', '')}`;
			expect(await limiter.open(user, 'a', 2, 1000)).toBe(true);
			expect(await limiter.open(user, 'b', 2, 1000)).toBe(true);
			expect(await limiter.open(user, 'c', 2, 1000)).toBe(false);
			expect(await limiter.open('usr_other', 'c', 2, 1000)).toBe(true);

			await limiter.close(user, 'a');
			expect(await limiter.open(user, 'c', 2, 1000)).toBe(true);

			// "b" keeps renewing; "c" belongs to a crashed replica and expires.
			t += 800;
			await limiter.renew(user, 'b', 1000);
			await limiter.renew(user, 'ghost', 1000); // renewing an unknown connection doesn't add it
			t += 500;
			expect(await limiter.open(user, 'd', 2, 1000)).toBe(true);
			expect(await limiter.open(user, 'e', 2, 1000)).toBe(false);
		});
	}

	it('redis: the counter key has an expiry', async () => {
		const user = `usr_${randomUUID().replaceAll('-', '')}`;
		await redisConnectionLimiter(redis).open(user, 'a', 5, 45_000);
		expect(await redis.pttl(`sse:${user}`)).toBeGreaterThan(0);
	});
});
