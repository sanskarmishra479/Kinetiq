import {makeUser, resetDb, testDb, testRepos} from '@kinetiq/db/testing';
import {bullQueues} from '@kinetiq/platform';
import {QUEUES} from '@kinetiq/shared';
import {Queue} from 'bullmq';
import {Redis} from 'ioredis';
import {afterAll, describe, expect, it} from 'vitest';
import {CRON_TASKS} from './processors/cron.js';
import {startWorkers} from './runtime.js';
import {testWorker} from './testing/index.js';

// The BullMQ wiring against the real Redis: queue → worker → processor, and cron schedules.
const db = testDb();
const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {maxRetriesPerRequest: null});
afterAll(async () => {
	await connection.quit();
});

describe('startWorkers', () => {
	it('processes queued jobs and registers every cron schedule; stops cleanly', async () => {
		await resetDb(db);
		const t = testRepos(db);
		const user = await makeUser(db);
		const w = testWorker({...t});
		w.container.bullConnection = connection;
		w.storage.put(`u/${user.id}/a`, new Uint8Array([1]), 'image/png');

		const stop = await startWorkers(w.container);
		try {
			const queues = bullQueues(connection);
			await queues.enqueue('maintenance', {kind: 'purge-user-files', userId: user.id});
			await expect.poll(() => w.storage.has(`u/${user.id}/a`), {timeout: 10_000}).toBe(false);
			await queues.close();

			const cron = new Queue(QUEUES.cron, {connection});
			const schedulers = await cron.getJobSchedulers();
			expect(schedulers.map((s) => s.key).sort()).toEqual(Object.keys(CRON_TASKS).sort());
			for (const s of schedulers) await cron.removeJobScheduler(s.key);
			await cron.close();
		} finally {
			await stop();
		}
	});

	it('needs a Redis connection', async () => {
		const w = testWorker({...testRepos(db)});
		await expect(startWorkers(w.container)).rejects.toThrow(/Redis/);
	});
});
