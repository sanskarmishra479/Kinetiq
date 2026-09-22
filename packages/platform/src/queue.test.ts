import {describe, expect, it} from 'vitest';
import {memoryQueues, parsePayload} from './queue.js';

const payload = {jobId: 'job_00000001', projectId: 'prj_00000001', userId: 'usr_00000001'};

describe('memoryQueues', () => {
	it('records valid jobs, dedupes by job id, and removes waiting jobs', async () => {
		const q = memoryQueues();
		await q.enqueue('generate', payload, {jobId: 'job_00000001'});
		await q.enqueue('generate', payload, {jobId: 'job_00000001'});
		await q.enqueue('maintenance', {kind: 'purge-user-files', userId: 'usr_00000001'});
		expect(q.jobs.map((j) => j.queue)).toEqual(['generate', 'maintenance']);
		expect(await q.remove('generate', 'job_00000001')).toBe(true);
		expect(await q.remove('generate', 'job_00000001')).toBe(false);
		await q.close();
	});

	it('refuses payloads that break the contract, going in and coming out', async () => {
		const q = memoryQueues();
		await expect(q.enqueue('generate', {...payload, extra: 1} as never)).rejects.toThrow();
		expect(() => parsePayload('generate', {jobId: 'nope'})).toThrow();
		await expect(q.enqueue('generate', payload, {jobId: 'probe:1'})).rejects.toThrow(/Invalid queue job id/);
		expect(parsePayload('generate', payload)).toEqual(payload);
	});
});
