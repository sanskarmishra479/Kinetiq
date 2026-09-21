// Time source for domain logic. Production passes a system clock; tests pass
// a FixedClock, so every test is deterministic (TEST_PLAN rule T3).
export interface ClockPort {
	/** Current time in epoch milliseconds. */
	now(): number;
}
