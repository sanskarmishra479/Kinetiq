// Plumbing shared by every real provider adapter (docs/TODO.md Phase 9):
// timeouts, a per-provider concurrency cap, and a circuit breaker so a failing
// provider is paused instead of hammered (NFR-REL-03). Errors never include
// API keys or request bodies (NFR-SEC-15).

export type Fetch = typeof globalThis.fetch;

/** A provider call that failed. `retryable` = worth trying again later (429, 5xx, timeouts). */
export class ProviderError extends Error {
	constructor(
		readonly provider: string,
		readonly status: number | null,
		message: string,
		readonly retryable: boolean,
	) {
		super(`${provider}: ${message}`);
		this.name = 'ProviderError';
	}
}

/** The provider has failed repeatedly; calls are paused for a short while. */
export class ProviderDegraded extends ProviderError {
	constructor(provider: string, retryInMs: number) {
		super(provider, null, `temporarily unavailable, retrying in ${Math.ceil(retryInMs / 1000)}s`, true);
		this.name = 'ProviderDegraded';
	}
}

const retryableStatus = (status: number) => status === 408 || status === 409 || status === 429 || status >= 500;

/** Short, safe description of a failed response: status plus the provider's error message, if any. */
async function describe(response: Response): Promise<string> {
	const text = await response.text().catch(() => '');
	try {
		const body = JSON.parse(text) as {error?: {message?: unknown} | string; message?: unknown};
		const message = typeof body.error === 'string' ? body.error : (body.error?.message ?? body.message ?? '');
		return `HTTP ${response.status}${message ? `: ${String(message).slice(0, 200)}` : ''}`;
	} catch {
		return `HTTP ${response.status}`;
	}
}

export type CallOptions = {
	provider: string;
	fetch: Fetch;
	timeoutMs: number;
	gate: Gate;
};

/** Calls a provider and returns the response, or throws a ProviderError. */
export async function call(options: CallOptions, url: string, init: RequestInit): Promise<Response> {
	const {provider, fetch, timeoutMs, gate} = options;
	return gate.run(async () => {
		let response: Response;
		try {
			response = await fetch(url, {...init, signal: AbortSignal.timeout(timeoutMs)});
		} catch (error) {
			const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
			throw new ProviderError(provider, null, timedOut ? `timed out after ${timeoutMs} ms` : 'network error', true);
		}
		if (!response.ok) {
			throw new ProviderError(provider, response.status, await describe(response), retryableStatus(response.status));
		}
		return response;
	});
}

/**
 * Concurrency cap + circuit breaker for one provider.
 * - At most `concurrency` calls run at once; the rest wait their turn.
 * - After `failures` retryable failures in a row, the breaker opens for
 *   `coolDownMs`: calls fail fast with ProviderDegraded, so jobs back off.
 */
export class Gate {
	private active = 0;
	private readonly waiting: (() => void)[] = [];
	private consecutiveFailures = 0;
	private openUntil = 0;

	constructor(
		private readonly provider: string,
		private readonly options: {concurrency: number; failures: number; coolDownMs: number; now?: () => number},
	) {}

	private now() {
		return this.options.now?.() ?? Date.now();
	}

	async run<T>(task: () => Promise<T>): Promise<T> {
		const wait = this.openUntil - this.now();
		if (wait > 0) throw new ProviderDegraded(this.provider, wait);

		if (this.active >= this.options.concurrency) await new Promise<void>((resolve) => this.waiting.push(resolve));
		this.active++;
		try {
			const result = await task();
			this.consecutiveFailures = 0;
			return result;
		} catch (error) {
			if (error instanceof ProviderError && error.retryable) {
				this.consecutiveFailures++;
				if (this.consecutiveFailures >= this.options.failures) {
					this.openUntil = this.now() + this.options.coolDownMs;
					this.consecutiveFailures = 0;
				}
			}
			throw error;
		} finally {
			this.active--;
			this.waiting.shift()?.();
		}
	}
}
