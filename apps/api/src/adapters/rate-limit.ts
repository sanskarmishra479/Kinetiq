import type {Redis} from 'ioredis';
import {RateLimiterMemory, RateLimiterRedis, RateLimiterRes, type RateLimiterAbstract} from 'rate-limiter-flexible';
import type {ConnectionLimitPort, RateLimitPort, RateLimitResult, RateLimitRule} from '../ports.js';

// Fixed-window counters per rule, backed by Redis in production (shared by
// every API replica) and by memory in tests. Keys expire on their own
// (NFR-SCALE-06: every non-queue Redis key has a TTL).

function adapter(make: (rule: RateLimitRule) => RateLimiterAbstract): RateLimitPort {
	const limiters = new Map<string, RateLimiterAbstract>();
	const limiterFor = (rule: RateLimitRule) => {
		let limiter = limiters.get(rule.name);
		if (!limiter) {
			limiter = make(rule);
			limiters.set(rule.name, limiter);
		}
		return limiter;
	};

	return {
		async consume(rule, key): Promise<RateLimitResult> {
			try {
				const res = await limiterFor(rule).consume(key);
				return {
					allowed: true,
					limit: rule.points,
					remaining: res.remainingPoints,
					resetSec: Math.ceil(res.msBeforeNext / 1000),
				};
			} catch (error) {
				if (!(error instanceof RateLimiterRes)) throw error;
				const resetSec = Math.max(1, Math.ceil(error.msBeforeNext / 1000));
				return {allowed: false, limit: rule.points, remaining: 0, resetSec, retryAfterSec: resetSec};
			}
		},
	};
}

export const redisRateLimiter = (redis: Redis): RateLimitPort =>
	adapter(
		(rule) =>
			new RateLimiterRedis({
				storeClient: redis,
				keyPrefix: `rl:${rule.name}`,
				points: rule.points,
				duration: rule.durationSec,
			}),
	);

export const memoryRateLimiter = (): RateLimitPort =>
	adapter(
		(rule) => new RateLimiterMemory({keyPrefix: `rl:${rule.name}`, points: rule.points, duration: rule.durationSec}),
	);

// ── SSE connection limit ────────────────────────────────────────────────────
// A sorted set per user: member = connection id, score = lease expiry.
// Opening is one atomic script: drop expired leases, count, add if under max.
const OPEN_SCRIPT = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[5])
return 1`;

const connKey = (userId: string) => `sse:${userId}`;

export function redisConnectionLimiter(redis: Redis, now: () => number = Date.now): ConnectionLimitPort {
	return {
		async open(userId, connectionId, max, leaseMs) {
			const t = now();
			const ok = await redis.eval(OPEN_SCRIPT, 1, connKey(userId), t, t + leaseMs, max, connectionId, leaseMs);
			return ok === 1;
		},
		async renew(userId, connectionId, leaseMs) {
			await redis
				.multi()
				.zadd(connKey(userId), 'XX', now() + leaseMs, connectionId)
				.pexpire(connKey(userId), leaseMs)
				.exec();
		},
		async close(userId, connectionId) {
			await redis.zrem(connKey(userId), connectionId);
		},
	};
}

export function memoryConnectionLimiter(now: () => number = Date.now): ConnectionLimitPort {
	const leases = new Map<string, Map<string, number>>();
	const live = (userId: string) => {
		const map = leases.get(userId) ?? new Map<string, number>();
		for (const [id, until] of map) if (until <= now()) map.delete(id);
		leases.set(userId, map);
		return map;
	};
	return {
		async open(userId, connectionId, max, leaseMs) {
			const map = live(userId);
			if (map.size >= max) return false;
			map.set(connectionId, now() + leaseMs);
			return true;
		},
		async renew(userId, connectionId, leaseMs) {
			const map = live(userId);
			if (map.has(connectionId)) map.set(connectionId, now() + leaseMs);
		},
		async close(userId, connectionId) {
			live(userId).delete(connectionId);
		},
	};
}
