import {z} from 'zod';
import {Message} from './api/messages.js';
import {JobStatus, PipelineNode} from './api/jobs.js';
import {CreditDelta, Credits, JobId, VersionId} from './common.js';

// Realtime project events sent over SSE (docs/API.md §8, SRS FR-GEN-04).
// The worker publishes them and the API forwards them; both validate with this schema.

export const ProjectEvent = z.discriminatedUnion('type', [
	z.object({type: z.literal('job.queued'), jobId: JobId, position: z.int().min(1)}),
	z.object({type: z.literal('step.started'), jobId: JobId, node: PipelineNode}),
	z.object({
		type: z.literal('step.progress'),
		jobId: JobId,
		node: PipelineNode,
		done: z.int().min(0),
		total: z.int().min(1),
		thumbUrl: z.url().optional(),
	}),
	z.object({type: z.literal('step.done'), jobId: JobId, node: PipelineNode, summary: z.string().max(300).optional()}),
	z.object({
		type: z.literal('step.failed'),
		jobId: JobId,
		node: PipelineNode,
		retrying: z.boolean(),
		attempt: z.int().min(1),
	}),
	z.object({type: z.literal('message.created'), message: Message}),
	z.object({
		type: z.literal('version.ready'),
		versionId: VersionId,
		number: z.int().min(1),
		posterUrl: z.url().nullable(),
	}),
	z.object({
		type: z.literal('job.finished'),
		jobId: JobId,
		status: JobStatus.exclude(['queued', 'running']),
		chargedCredits: Credits,
		refunded: Credits,
	}),
	z.object({type: z.literal('credits.updated'), total: CreditDelta}),
]);
export type ProjectEvent = z.infer<typeof ProjectEvent>;
export type ProjectEventType = ProjectEvent['type'];

/** Redis pub/sub channel for one project's events. */
export const projectChannel = (projectId: string) => `project:${projectId}`;
