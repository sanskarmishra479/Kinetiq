import {z} from 'zod';
import {PresetId, VideoModelId, VoiceId, Language} from '../catalog.js';
import {AssetId, BrandKitId, Duration, ProjectId, PublicUrl, Ratio, TemplateId, Timestamp} from '../common.js';

// Projects: docs/API.md §4, SRS FR-PRJ-01…05.

export const MAX_ASSETS_PER_PROJECT = 10;
export const MAX_PROMPT_CHARS = 2000;

export const CreateProjectRequest = z.strictObject({
	url: PublicUrl,
	durationSec: Duration,
	ratio: Ratio,
	/** AI cinematic clips are post-MVP; omit or null for none. */
	model: VideoModelId.nullable().optional(),
	templateId: TemplateId.nullable().optional(),
	assetIds: z
		.array(AssetId)
		.max(MAX_ASSETS_PER_PROJECT, `at most ${MAX_ASSETS_PER_PROJECT} attachments`)
		.refine((ids) => new Set(ids).size === ids.length, 'attachments must be unique')
		.default([]),
	prompt: z.string().trim().max(MAX_PROMPT_CHARS).nullable().optional(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequest>;

export const ProjectStatus = z.enum(['setup', 'ready', 'generating', 'done', 'failed']);

// Answers collected by the setup questions (FR-CHAT-01, 02).
export const VoiceoverSettings = z.object({
	enabled: z.boolean(),
	voiceId: VoiceId.nullable(),
	language: Language.nullable(),
	scriptBy: z.enum(['ai', 'user']).nullable(),
});

export const DesignChoice = z.discriminatedUnion('kind', [
	z.object({kind: z.literal('auto')}),
	z.object({kind: z.literal('preset'), presetId: PresetId}),
	z.object({kind: z.literal('brandKit'), brandKitId: BrandKitId}),
]);
export type DesignChoice = z.infer<typeof DesignChoice>;

export const ProjectSettings = z.object({
	voiceover: VoiceoverSettings.nullable(),
	design: DesignChoice.nullable(),
});

export const Project = z.object({
	id: ProjectId,
	status: ProjectStatus,
	url: z.url(),
	durationSec: Duration,
	ratio: Ratio,
	model: VideoModelId.nullable(),
	templateId: TemplateId.nullable(),
	prompt: z.string().nullable(),
	settings: ProjectSettings,
	createdAt: Timestamp,
	updatedAt: Timestamp,
});
export type Project = z.infer<typeof Project>;

export const ProjectResponse = z.object({project: Project});
