import {idSchema} from '@kinetiq/shared';
import {describe, expect, it} from 'vitest';
import {createIdGenerator} from './ids.js';

describe('createIdGenerator', () => {
	it('produces ids that match the shared id format', () => {
		const ids = createIdGenerator();
		expect(idSchema('project').safeParse(ids.next('prj')).success).toBe(true);
		expect(idSchema('job').safeParse(ids.next('job')).success).toBe(true);
	});

	it('sorts by creation time', () => {
		let t = 1_700_000_000_000;
		const ids = createIdGenerator(() => t);
		const first = ids.next('prj');
		t += 1;
		const second = ids.next('prj');
		t += 86_400_000;
		const third = ids.next('prj');
		expect([third, first, second].sort()).toEqual([first, second, third]);
	});

	it('does not collide', () => {
		const ids = createIdGenerator(() => 1_700_000_000_000);
		const seen = new Set(Array.from({length: 10_000}, () => ids.next('ast')));
		expect(seen.size).toBe(10_000);
	});
});
