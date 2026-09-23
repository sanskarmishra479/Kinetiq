import {describe, expect, it} from 'vitest';
import {memoryKv} from './kv.js';

describe('memoryKv', () => {
	it('stores values until they expire', async () => {
		let now = 1_000_000;
		const kv = memoryKv(() => now);
		await kv.set('a', 'one', 60);
		expect(await kv.get('a')).toBe('one');
		expect(await kv.get('missing')).toBeNull();

		now += 59_000;
		expect(await kv.get('a')).toBe('one');
		now += 2_000;
		expect(await kv.get('a')).toBeNull();
		expect(kv.size()).toBe(0);
	});
});
