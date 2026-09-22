import type {Redis} from 'ioredis';
import {RateLimiterMemory, RateLimiterRedis, RateLimiterRes, type RateLimiterAbstract} from 'rate-limiter-flexible';
import type {RateLimitPort, RateLimitResult, RateLimitRule} from '../ports.js';

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
