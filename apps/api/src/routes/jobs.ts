import {closeJob, isUniqueViolation} from '@kinetiq/db';
import {estimate, InsufficientCredits} from '@kinetiq/domain';
import {GenerateRequest, PAYG_LIMITS, PLANS, type JobResponse} from '@kinetiq/shared';
import {Router, type Request, type Response} from 'express';
import {randomUUID} from 'node:crypto';
import type {z} from 'zod';
import type {Container} from '../container.js';
import {AppError, notFound} from '../errors.js';
import {idempotent} from '../middleware/idempotency.js';
import {requireAuth} from '../middleware/session.js';

// Generation, jobs and live events (docs/API.md §6, §8; FR-GEN-01…11).

const DAY_MS = 24 * 60 * 60 * 1000;
/** Projects that can start a new generation (done → edits, Phase 12). */
const CAN_GENERATE = new Set(['ready', 'failed']);

export const SSE = {
	maxPerUser: 5,
	heartbeatMs: 15_000,
	/** Lease for the connection counter; renewed on every heartbeat. */
	leaseMs: 45_000,
};

export function jobRoutes(container: Container, sse = SSE): Router {
	const {repos, locks, queues, events, connections, config, clock, logger} = container;
	const router = Router();
	router.use(['/projects/:projectId/generate', '/projects/:projectId/events', '/jobs'], requireAuth);

	/** Price check, credit reservation and enqueue, in that order (FR-GEN-02). */
	router.post('/projects/:projectId/generate', idempotent(repos.idempotency, locks), async (req, res) => {
		const userId = req.auth!.userId;
		const {expectedCredits} = GenerateRequest.parse(req.body);
		const project = await repos.projects.get(userId, String(req.params.projectId));
		if (!project) throw notFound('Project not found');
		if (!CAN_GENERATE.has(project.status)) {
			throw new AppError(
				'CONFLICT',
				project.status === 'setup' ? 'Finish the setup questions first' : 'A video is already being made',
			);
		}
		if (await repos.featureFlags.get('pause_new_jobs', false)) {
			throw new AppError('DEGRADED', 'New videos are paused for a few minutes. Please try again soon.');
		}

		const {credits} = estimate({
			durationSec: project.durationSec,
			voiceover: project.settings.voiceover?.enabled ?? false,
			aiClips: 0,
			templateDiscountPct: project.templateId ? await repos.templates.discountPct(project.templateId) : 0,
		});
		if (credits !== expectedCredits) {
			throw new AppError('CONFLICT', 'The price changed. Please review the new estimate.', {credits});
		}

		// One user's generate requests run one at a time, so the plan limits can't be raced.
		const release = await locks.acquire(`generate:${userId}`, 15_000);
		if (!release) throw new AppError('CONCURRENCY_LIMIT', 'Another video is being started. Try again in a moment.');
		try {
			const limits = await limitsFor(container, userId);
			if ((await repos.jobs.countActive(userId)) >= limits.concurrentJobs) {
				throw new AppError('CONCURRENCY_LIMIT', `Your plan makes ${limits.concurrentJobs} video(s) at a time.`, {
					limit: limits.concurrentJobs,
				});
			}
			if ((await repos.jobs.countSince(userId, clock.now() - DAY_MS)) >= limits.dailyJobs) {
				throw new AppError('RATE_LIMITED', `Daily limit of ${limits.dailyJobs} videos reached.`, {
					limit: limits.dailyJobs,
				});
			}

			let job;
			try {
				job = await repos.jobs.create(userId, project.id, {
					type: 'generate',
					reservedCredits: 0,
					deadlineMinutes: config.JOB_DEADLINE_MINUTES,
				});
			} catch (error) {
				// The partial unique index: another job for this project won a race.
				if (isUniqueViolation(error)) throw new AppError('CONFLICT', 'A video is already being made');
				throw error;
			}
			if (!job) throw notFound('Project not found');

			try {
				await repos.credits.reserveForJob(userId, job.id, credits);
			} catch (error) {
				await repos.jobs.discard(userId, job.id);
				throw error instanceof InsufficientCredits
					? new AppError('INSUFFICIENT_CREDITS', 'Not enough credits for this video.', {needed: credits})
					: error;
			}

			await repos.projects.setStatus(userId, project.id, 'generating');
			try {
				await queues.enqueue('generate', {jobId: job.id, projectId: project.id, userId}, {jobId: job.id});
			} catch (error) {
				// The queue is down: give the credits back now instead of waiting for the deadline sweep.
				await closeJob(
					repos,
					{id: job.id, userId, projectId: project.id},
					{
						status: 'failed',
						error: {code: 'DEGRADED', message: 'Could not start the video. Your credits were refunded.'},
					},
				);
				await repos.projects.setStatus(userId, project.id, 'ready');
				logger.error({err: error}, 'enqueue failed');
				throw new AppError('DEGRADED', 'Could not start the video right now. Your credits were refunded.');
			}
			const position = (await repos.jobs.queuePosition(job.id)) ?? 1;
			await events.publish(project.id, {type: 'job.queued', jobId: job.id, position});
			const balance = await repos.credits.balance(userId);
			await events.publish(project.id, {
				type: 'credits.updated',
				total: balance.debt > 0 ? -balance.debt : balance.available,
			});

			const body: z.infer<typeof JobResponse> = {job: (await repos.jobs.get(userId, job.id))!};
			res.status(202).json(body);
		} finally {
			await release();
		}
	});

	router.get('/jobs/:jobId', async (req, res) => {
		const job = await repos.jobs.get(req.auth!.userId, String(req.params.jobId));
		if (!job) throw notFound('Job not found');
		res.json({job});
	});

	/** Stops the job and refunds every reserved credit (FR-GEN-09). */
	router.post('/jobs/:jobId/cancel', async (req, res) => {
		const userId = req.auth!.userId;
		const jobId = String(req.params.jobId);
		const row = await repos.jobs.systemGet(jobId);
		if (!row || row.userId !== userId) throw notFound('Job not found');

		const result = await closeJob(repos, row, {status: 'cancelled'});
		if (!result) throw new AppError('CONFLICT', 'This job has already finished');
		// A queued job is removed; a running one sees the status change and stops.
		await queues.remove(row.type === 'edit' ? 'edit' : 'generate', jobId);
		await events.publish(row.projectId, {
			type: 'job.finished',
			jobId,
			status: 'cancelled',
			chargedCredits: result.charged,
			refunded: result.refunded,
		});
		const balance = await repos.credits.balance(userId);
		await events.publish(row.projectId, {
			type: 'credits.updated',
			total: balance.debt > 0 ? -balance.debt : balance.available,
		});
		res.json({job: await repos.jobs.get(userId, jobId)});
	});

	/**
	 * Live project events over Server-Sent Events (docs/API.md §8).
	 * Resumes after a reconnect from Last-Event-ID (header, or ?lastEventId= for the first connect).
	 */
	router.get('/projects/:projectId/events', async (req, res) => {
		const userId = req.auth!.userId;
		const project = await repos.projects.get(userId, String(req.params.projectId));
		if (!project) throw notFound('Project not found');
		const connectionId = randomUUID();
		if (!(await connections.open(userId, connectionId, sse.maxPerUser, sse.leaseMs))) {
			throw new AppError('RATE_LIMITED', 'Too many open live connections. Close another tab.', undefined, {
				'Retry-After': '15',
			});
		}
		await streamEvents(req, res, project.id, lastEventId(req), {
			events,
			heartbeatMs: sse.heartbeatMs,
			onHeartbeat: () => connections.renew(userId, connectionId, sse.leaseMs),
			onClose: () => connections.close(userId, connectionId),
			onError: (err) => logger.warn({err}, 'sse stream error'),
		});
	});

	return router;
}

async function limitsFor({repos}: Container, userId: string) {
	const profile = await repos.accounts.getProfile(userId);
	const plan = profile?.plan ? PLANS.find((p) => p.code === profile.plan?.code) : undefined;
	return plan?.limits ?? PAYG_LIMITS;
}

function lastEventId(req: Request): number {
	const raw = req.get('last-event-id') ?? (typeof req.query.lastEventId === 'string' ? req.query.lastEventId : '0');
	const n = Number(raw);
	return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

async function streamEvents(
	req: Request,
	res: Response,
	projectId: string,
	afterId: number,
	opts: {
		events: Container['events'];
		heartbeatMs: number;
		onHeartbeat: () => Promise<void>;
		onClose: () => Promise<void>;
		onError: (err: unknown) => void;
	},
) {
	res.status(200);
	res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
	res.setHeader('Cache-Control', 'no-cache, no-transform');
	res.setHeader('Connection', 'keep-alive');
	res.setHeader('X-Accel-Buffering', 'no');
	res.flushHeaders();

	let lastSent = afterId;
	const send = (envelope: {id: number; event: {type: string}}) => {
		if (envelope.id <= lastSent) return; // already sent (replay and live can overlap)
		lastSent = envelope.id;
		res.write(`id: ${envelope.id}\nevent: ${envelope.event.type}\ndata: ${JSON.stringify(envelope.event)}\n\n`);
	};

	// Clean up once, whenever the client goes away, even while we are still
	// subscribing or replaying.
	const state: {closed: boolean; heartbeat?: ReturnType<typeof setInterval>; unsubscribe?: () => Promise<void>} = {
		closed: false,
	};
	const cleanup = () => {
		clearInterval(state.heartbeat);
		Promise.all([state.unsubscribe?.(), opts.onClose()]).catch(opts.onError);
	};
	req.on('close', () => {
		state.closed = true;
		if (state.unsubscribe) cleanup();
	});

	// Subscribe first and buffer, then replay, so nothing published in between is lost.
	let buffer: Parameters<typeof send>[0][] | null = [];
	state.unsubscribe = await opts.events.subscribe(projectId, (e) => (buffer ? buffer.push(e) : send(e)));
	if (state.closed) return cleanup();
	res.write('retry: 3000\n\n');
	for (const e of await opts.events.replay(projectId, afterId)) send(e);
	for (const e of buffer.sort((a, b) => a.id - b.id)) send(e);
	buffer = null;
	if (state.closed) return; // closed during the replay; cleanup already ran

	state.heartbeat = setInterval(() => {
		res.write(': ping\n\n');
		opts.onHeartbeat().catch(opts.onError);
	}, opts.heartbeatMs);
}
