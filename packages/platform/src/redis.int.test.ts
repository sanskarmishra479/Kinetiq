import type {ProjectEvent} from '@kinetiq/shared';
import {Worker} from 'bullmq';
import {Redis} from 'ioredis';
import {randomUUID} from 'node:crypto';
import {afterAll, describe, expect, it} from 'vitest';
import {redisEventBus, REPLAY_LIMIT} from './events.js';
import {bullQueues} from './queue.js';
import {assertRedisNoEviction, UnsafeRedisPolicy} from './redis.js';

// Real Redis from docker compose.
const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
const pub = new Redis(url);
const sub = new Redis(url);
const bullConn = new Redis(url, {maxRetriesPerRequest: null});

afterAll(async () => {
	await Promise.all([pub.quit(), sub.quit(), bullConn.quit()]);
});

const queued = (position: number): ProjectEvent => ({type: 'job.queued', jobId: 'job_00000001', position});

describe('redisEventBus', () => {
	it('delivers events across connections in order, with increasing ids', async () => {
		const bus = redisEventBus(pub, sub);
		const project = `prj_${randomUUID().replaceAll('-', '')}`;
		const got: number[] = [];
		const stop = await bus.subscribe(project, (e) => got.push(e.event.type === 'job.queued' ? e.event.position : -1));
		for (let i = 1; i <= 5; i++) await bus.publish(project, queued(i));
		await expect.poll(() => got).toEqual([1, 2, 3, 4, 5]);
		await stop();
		await bus.publish(project, queued(6));
		await new Promise((r) => setTimeout(r, 50));
		expect(got).toHaveLength(5);
	});

	it('replays newer events, keeps the last 100 and sets TTLs on every key (NFR-SCALE-06)', async () => {
		const bus = redisEventBus(pub, sub);
		const project = `prj_${randomUUID().replaceAll('-', '')}`;
		for (let i = 1; i <= REPLAY_LIMIT + 3; i++) await bus.publish(project, queued(i));
		const all = await bus.replay(project, 0);
		expect(all).toHaveLength(REPLAY_LIMIT);
		expect(all.at(-1)?.id).toBe(REPLAY_LIMIT + 3);
		expect((await bus.replay(project, REPLAY_LIMIT + 1)).map((e) => e.id)).toEqual([102, 103]);
		expect(await pub.ttl(`evlog:${project}`)).toBeGreaterThan(0);
		expect(await pub.ttl(`evseq:${project}`)).toBeGreaterThan(0);
	});

	it('ignores junk published on a project channel', async () => {
		const bus = redisEventBus(pub, sub);
		const project = `prj_${randomUUID().replaceAll('-', '')}`;
		const got: unknown[] = [];
		await bus.subscribe(project, (e) => got.push(e));
		await pub.publish(`project:${project}`, 'not json');
		await pub.publish(`project:${project}`, JSON.stringify({id: 1, event: {type: 'evil'}}));
		await bus.publish(project, queued(1));
		await expect.poll(() => got.length).toBe(1);
	});
});

describe('bullQueues', () => {
	it('enqueues validated jobs a worker can take, dedupes by id, and removes waiting jobs', async () => {
		const queues = bullQueues(bullConn);
		const jobId = `job_${randomUUID().replaceAll('-', '')}`;
		const payload = {jobId, projectId: 'prj_00000001', userId: 'usr_00000001'};
		await queues.enqueue('generate', payload, {jobId, delayMs: 60_000});
		await queues.enqueue('generate', payload, {jobId, delayMs: 60_000});
		expect(await queues.remove('generate', jobId)).toBe(true);
		expect(await queues.remove('generate', jobId)).toBe(false);

		const seen: unknown[] = [];
		const worker = new Worker(
			'maintenance',
			async (job) => {
				seen.push(job.data);
			},
			{connection: bullConn},
		);
		const userId = `usr_${randomUUID().replaceAll('-', '')}`;
		await queues.enqueue('maintenance', {kind: 'purge-user-files', userId});
		await expect.poll(() => seen, {timeout: 5000}).toContainEqual({kind: 'purge-user-files', userId});
		await worker.close();
		await expect(queues.enqueue('generate', {jobId: 'bad'} as never)).rejects.toThrow();
		await queues.close();
	});
});

describe('assertRedisNoEviction', () => {
	it('passes on the compose Redis (noeviction)', async () => {
		expect(await assertRedisNoEviction(pub)).toBe('noeviction');
	});

	it('throws for any other policy and returns "unknown" when CONFIG is blocked', async () => {
		const fake = (reply: unknown) => ({config: async () => reply}) as unknown as Redis;
		await expect(assertRedisNoEviction(fake(['maxmemory-policy', 'allkeys-lru']))).rejects.toThrow(UnsafeRedisPolicy);
		await expect(assertRedisNoEviction(fake([]))).rejects.toThrow(/unset/);
		const blocked = {config: async () => Promise.reject(new Error('unknown command'))} as unknown as Redis;
		expect(await assertRedisNoEviction(blocked)).toBe('unknown');
	});
});
