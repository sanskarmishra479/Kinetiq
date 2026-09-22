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

export interface HealthPort {
	/** Names of dependencies that are down (empty = ready). */
	check(): Promise<string[]>;
}
