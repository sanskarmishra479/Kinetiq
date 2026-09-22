import {ProjectEvent, projectChannel} from '@kinetiq/shared';
import type {Redis} from 'ioredis';
import {z} from 'zod';

// Live project events (docs/API.md §8, FR-GEN-04).
// - Every event gets an increasing id per project, used by SSE for
//   Last-Event-ID resume.
// - The last 100 events per project are kept for replay, and expire after a
//   day (NFR-SCALE-06: every non-queue Redis key has a TTL).
// - Events are validated when published and when received.

export const REPLAY_LIMIT = 100;
const TTL_SEC = 24 * 60 * 60;

export const EventEnvelope = z.object({id: z.int().min(1), event: ProjectEvent});
export type EventEnvelope = z.infer<typeof EventEnvelope>;

export interface EventBusPort {
	publish(projectId: string, event: ProjectEvent): Promise<EventEnvelope>;
	/** Returns an unsubscribe function. */
	subscribe(projectId: string, onEvent: (envelope: EventEnvelope) => void): Promise<() => Promise<void>>;
	/** Stored events with id > afterId, oldest first. */
	replay(projectId: string, afterId: number): Promise<EventEnvelope[]>;
}

const seqKey = (projectId: string) => `evseq:${projectId}`;
const logKey = (projectId: string) => `evlog:${projectId}`;

/**
 * Redis implementation. `publisher` is a normal connection; `subscriber` must
 * be a dedicated connection (Redis puts it in subscribe-only mode).
 */
export function redisEventBus(publisher: Redis, subscriber: Redis): EventBusPort {
	const handlers = new Map<string, Set<(e: EventEnvelope) => void>>();

	subscriber.on('message', (channel: string, message: string) => {
		const set = handlers.get(channel);
		if (!set) return;
		const parsed = EventEnvelope.safeParse(safeJson(message));
		if (!parsed.success) return;
		for (const handler of set) handler(parsed.data);
	});

	return {
		async publish(projectId, event) {
			const envelope: EventEnvelope = {id: await publisher.incr(seqKey(projectId)), event: ProjectEvent.parse(event)};
			const json = JSON.stringify(envelope);
			await publisher
				.multi()
				.lpush(logKey(projectId), json)
				.ltrim(logKey(projectId), 0, REPLAY_LIMIT - 1)
				.expire(logKey(projectId), TTL_SEC)
				.expire(seqKey(projectId), TTL_SEC)
				.publish(projectChannel(projectId), json)
				.exec();
			return envelope;
		},

		async subscribe(projectId, onEvent) {
			const channel = projectChannel(projectId);
			let set = handlers.get(channel);
			if (!set) {
				set = new Set();
				handlers.set(channel, set);
				await subscriber.subscribe(channel);
			}
			set.add(onEvent);
			return async () => {
				set.delete(onEvent);
				if (set.size === 0 && handlers.get(channel) === set) {
					handlers.delete(channel);
					await subscriber.unsubscribe(channel);
				}
			};
		},

		async replay(projectId, afterId) {
			const raw = await publisher.lrange(logKey(projectId), 0, -1);
			return raw
				.map((m) => EventEnvelope.safeParse(safeJson(m)))
				.flatMap((r) => (r.success && r.data.id > afterId ? [r.data] : []))
				.sort((a, b) => a.id - b.id);
		},
	};
}

/** Tests and single-process use: same behavior, in memory. */
export function memoryEventBus(): EventBusPort & {published: EventEnvelope[]} {
	const seq = new Map<string, number>();
	const logs = new Map<string, EventEnvelope[]>();
	const handlers = new Map<string, Set<(e: EventEnvelope) => void>>();
	const published: EventEnvelope[] = [];
	return {
		published,
		async publish(projectId, event) {
			const id = (seq.get(projectId) ?? 0) + 1;
			seq.set(projectId, id);
			const envelope = {id, event: ProjectEvent.parse(event)};
			const log = [...(logs.get(projectId) ?? []), envelope].slice(-REPLAY_LIMIT);
			logs.set(projectId, log);
			published.push(envelope);
			for (const handler of handlers.get(projectId) ?? []) handler(envelope);
			return envelope;
		},
		async subscribe(projectId, onEvent) {
			const set = handlers.get(projectId) ?? new Set();
			handlers.set(projectId, set);
			set.add(onEvent);
			return async () => void set.delete(onEvent);
		},
		async replay(projectId, afterId) {
			return (logs.get(projectId) ?? []).filter((e) => e.id > afterId);
		},
	};
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
