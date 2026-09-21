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

// Predictable ids: prj_1, prj_2, job_1, ...
export class SeqId implements IdPort {
	private counters = new Map<string, number>();

	next(prefix: string): string {
		const n = (this.counters.get(prefix) ?? 0) + 1;
		this.counters.set(prefix, n);
		return `${prefix}_${n}`;
	}
}
