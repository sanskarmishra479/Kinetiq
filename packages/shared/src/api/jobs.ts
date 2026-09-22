import {z} from 'zod';
import {CreditItem} from '../catalog.js';
import {Credits, JobId, Timestamp, VersionId} from '../common.js';
import {ErrorCode} from '../errors.js';

// Generation and jobs: docs/API.md §6, SRS FR-GEN-01…11.

/** Pipeline nodes, in order (docs/ARCHITECTURE.md §5). */
export const PIPELINE_NODES = [
	'research',
	'designMd',
	'director',
	'fillTemplate',
	'voiceover',
	'sceneCoder',
	'validate',
	'previewStills',
	'visualQA',
	'sceneFix',
	'aiClips',
	'audio',
	'finalRender',
	'settle',
	'notify',
] as const;
export const PipelineNode = z.enum(PIPELINE_NODES);
export type PipelineNode = z.infer<typeof PipelineNode>;

export const EstimateResponse = z.object({
	credits: Credits,
	breakdown: z.array(z.object({item: CreditItem, credits: Credits})),
	balance: Credits,
	canAfford: z.boolean(),
});
export type EstimateResponse = z.infer<typeof EstimateResponse>;

/** POST /v1/projects/:id/generate: the user confirms the price they saw (FR-GEN-01). */
export const GenerateRequest = z.strictObject({expectedCredits: z.int().min(1)});
export type GenerateRequest = z.infer<typeof GenerateRequest>;

export const JobStatus = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export type JobStatus = z.infer<typeof JobStatus>;

export const StepStatus = z.enum(['pending', 'running', 'done', 'failed', 'skipped']);

export const JobStep = z.object({
	node: PipelineNode,
	status: StepStatus,
	progress: z.object({done: z.int().min(0), total: z.int().min(1)}).optional(),
	startedAt: Timestamp.nullable(),
	endedAt: Timestamp.nullable(),
});

export const Job = z.object({
	id: JobId,
	type: z.enum(['generate', 'edit']),
	status: JobStatus,
	reservedCredits: Credits,
	chargedCredits: Credits.nullable(),
	queuePosition: z.int().min(1).nullable(),
	steps: z.array(JobStep),
	versionId: VersionId.nullable(),
	error: z.object({code: ErrorCode, message: z.string()}).nullable(),
});
export type Job = z.infer<typeof Job>;

export const JobResponse = z.object({job: Job});
