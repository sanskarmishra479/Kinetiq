// Randomness for domain logic. Always injected and seedable, so any
// "random" choice can be replayed exactly in tests.
export interface RandomPort {
	/** A float in [0, 1). */
	next(): number;
}

// mulberry32: a tiny, fast, well-distributed seeded PRNG.
export function seededRandom(seed: number): RandomPort {
	let state = seed >>> 0;
	return {
		next() {
			state = (state + 0x6d2b79f5) >>> 0;
			let t = state;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		},
	};
}
