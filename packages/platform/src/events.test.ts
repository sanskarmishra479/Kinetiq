import {describe, expect, it} from 'vitest';
import {memoryEventBus, REPLAY_LIMIT} from './events.js';

const job = 'job_00000001';
const queued = (position: number) => ({type: 'job.queued' as const, jobId: job, position});

describe('memoryEventBus', () => {
	it('numbers events per project and delivers them to subscribers', async () => {
		const bus = memoryEventBus();
		const got: number[] = [];
		const stop = await bus.subscribe('prj_a', (e) => got.push(e.id));
		await bus.publish('prj_a', queued(1));
		await bus.publish('prj_b', queued(1));
		await bus.publish('prj_a', queued(2));
		await stop();
		await bus.publish('prj_a', queued(3));
		expect(got).toEqual([1, 2]);
		expect((await bus.replay('prj_b', 0)).map((e) => e.id)).toEqual([1]);
	});

	it('replays only newer events and keeps the last 100', async () => {
		const bus = memoryEventBus();
		for (let i = 1; i <= REPLAY_LIMIT + 5; i++) await bus.publish('prj_a', queued(i));
		const all = await bus.replay('prj_a', 0);
		expect(all).toHaveLength(REPLAY_LIMIT);
		expect(all[0]?.id).toBe(6);
		expect((await bus.replay('prj_a', 103)).map((e) => e.id)).toEqual([104, 105]);
		expect(await bus.replay('prj_none', 0)).toEqual([]);
	});

	it('rejects events that break the contract', async () => {
		const bus = memoryEventBus();
		await expect(bus.publish('prj_a', {type: 'job.queued', jobId: job, position: 0})).rejects.toThrow();
	});
});
