import {z} from 'zod';
import {ClipId, JobId, MessageId, ProjectId, UserId, VersionId} from './common.js';

// BullMQ queue names and payloads (docs/API.md §16). Producers and consumers
// both parse with these schemas, so a payload change breaks the build on both sides.

export const QUEUES = {
	generate: 'generate',
	edit: 'edit',
	render: 'render',
	mediaPoll: 'media-poll',
	email: 'email',
	cron: 'cron',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const GeneratePayload = z.strictObject({jobId: JobId, projectId: ProjectId, userId: UserId});
export type GeneratePayload = z.infer<typeof GeneratePayload>;

export const EditPayload = GeneratePayload.extend({messageId: MessageId});
export type EditPayload = z.infer<typeof EditPayload>;

export const RenderPayload = z.strictObject({
	jobId: JobId,
	kind: z.enum(['still', 'final']),
	versionId: VersionId,
	/** Object-storage key of the renderer inputProps (kept out of Redis to keep payloads small). */
	inputPropsKey: z.string().min(1).max(512),
});
export type RenderPayload = z.infer<typeof RenderPayload>;

export const MediaPollPayload = z.strictObject({
	jobId: JobId,
	clipId: ClipId,
	providerJobId: z.string().min(1).max(200),
});
export type MediaPollPayload = z.infer<typeof MediaPollPayload>;

export const EMAIL_TEMPLATES = ['magicLink', 'receipt', 'creditsAdded', 'lowBalance'] as const;

export const EmailPayload = z.strictObject({
	to: z.email(),
	template: z.enum(EMAIL_TEMPLATES),
	data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});
export type EmailPayload = z.infer<typeof EmailPayload>;
