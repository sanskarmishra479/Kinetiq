import type {ClockPort} from '../ports/clock.js';
import type {IdPort} from '../ports/id.js';

// A clock that only moves when the test says so.
export class FixedClock implements ClockPort {
	constructor(private current: number) {}

	now(): number {
		return this.current;
	}

	advance(ms: number): void {
		this.current += ms;
	}

	set(epochMs: number): void {
		this.current = epochMs;
	}
}

// Predictable ids that match the real id format: prj_00000001, prj_00000002, …
// (zero-padded so they also sort in creation order, like real ids).
export class SeqId implements IdPort {
	private counters = new Map<string, number>();

	next(prefix: string): string {
		const n = (this.counters.get(prefix) ?? 0) + 1;
		this.counters.set(prefix, n);
		return `${prefix}_${String(n).padStart(8, '0')}`;
	}
}
