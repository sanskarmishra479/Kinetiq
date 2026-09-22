// External systems the API talks to. Real adapters live in ./adapters; tests
// use the in-memory versions (docs/ARCHITECTURE.md §8, TEST_PLAN rule T2).

export type EmailMessage =
	{template: 'magicLink'; to: string; url: string} | {template: 'notice'; to: string; subject: string; text: string};

export interface EmailPort {
	send(message: EmailMessage): Promise<void>;
}

export interface CaptchaPort {
	/** True when the Turnstile token is valid for this client IP. */
	verify(token: string | undefined, ip: string | undefined): Promise<boolean>;
}

export type RateLimitRule = {name: string; points: number; durationSec: number};

export type RateLimitResult =
	| {allowed: true; limit: number; remaining: number; resetSec: number}
	| {allowed: false; limit: number; remaining: 0; resetSec: number; retryAfterSec: number};

export interface RateLimitPort {
	consume(rule: RateLimitRule, key: string): Promise<RateLimitResult>;
}

export interface LockPort {
	/** Takes the lock if free. Returns a release function, or null if already held. */
	acquire(key: string, ttlMs: number): Promise<(() => Promise<void>) | null>;
}

/**
 * Counts open long-lived connections (SSE) per user across every API replica.
 * Each connection has a lease that the heartbeat renews, so connections of a
 * crashed replica stop counting once their lease runs out.
 */
export interface ConnectionLimitPort {
	/** Registers the connection if the user has fewer than `max` open. */
	open(userId: string, connectionId: string, max: number, leaseMs: number): Promise<boolean>;
	renew(userId: string, connectionId: string, leaseMs: number): Promise<void>;
	close(userId: string, connectionId: string): Promise<void>;
}

export interface HealthPort {
	/** Names of dependencies that are down (empty = ready). */
	check(): Promise<string[]>;
}

export type {EventBusPort, PresignedPut, QueuePort, StoragePort} from '@kinetiq/platform';
