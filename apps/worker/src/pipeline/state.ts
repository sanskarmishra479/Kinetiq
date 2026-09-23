import {
	DesignTokens,
	DirectorPlan,
	Duration,
	PipelineNode,
	QaReport,
	Ratio,
	ResearchResult,
	type DesignChoice,
} from '@kinetiq/shared';
import {z} from 'zod';

// Everything the pipeline knows about one job. It is saved after each node,
// so a retry continues instead of paying for finished work again (FR-GEN-05).
// Big artifacts (stills, audio, video) live in object storage; the state only
// holds their keys (NFR-SCALE-07).

export const SceneState = z.strictObject({
	index: z.int().min(0),
	/** Validated TSX written by the model. */
	code: z.string(),
	/** Compiled JS handed to the renderer. */
	compiled: z.string(),
	/** Data the scene renders (text, urls). */
	props: z.record(z.string(), z.unknown()),
	durationFrames: z.int().min(1),
	/** Fix rounds spent on this scene (FR-GEN-07). */
	fixes: z.int().min(0),
	qa: QaReport.nullable(),
	/** Set when the rebuilt UI was replaced by the real screenshot. */
	screenshotKey: z.string().nullable(),
	stillKey: z.string().nullable(),
});
export type SceneState = z.infer<typeof SceneState>;

export const AudioTrack = z.strictObject({
	key: z.string(),
	fromFrame: z.int().min(0),
	volume: z.number().min(0).max(1),
});

export const PipelineState = z.strictObject({
	completed: z.array(PipelineNode),
	input: z.strictObject({
		url: z.url(),
		durationSec: Duration,
		ratio: Ratio,
		prompt: z.string().nullable(),
		voiceover: z.strictObject({enabled: z.boolean(), voiceId: z.string(), language: z.string()}).nullable(),
		design: z.unknown().nullable(),
		templateId: z.string().nullable(),
	}),
	research: ResearchResult.nullable(),
	theme: DesignTokens.nullable(),
	plan: DirectorPlan.nullable(),
	scenes: z.array(SceneState),
	audio: z.array(AudioTrack),
	captions: z.array(z.strictObject({text: z.string(), start: z.int(), end: z.int()})),
	video: z.strictObject({key: z.string(), posterKey: z.string(), durationSec: z.number()}).nullable(),
	versionId: z.string().nullable(),
	/** Credits to charge, decided once the video exists (FR-CRD-05). */
	charge: z.int().min(0).nullable(),
});
export type PipelineState = z.infer<typeof PipelineState>;

export type JobInput = {
	jobId: string;
	userId: string;
	projectId: string;
	url: string;
	durationSec: PipelineState['input']['durationSec'];
	ratio: PipelineState['input']['ratio'];
	prompt: string | null;
	voiceover: {enabled: boolean; voiceId: string; language: string} | null;
	design: DesignChoice | null;
	templateId: string | null;
};

export const initialState = (input: JobInput): PipelineState => ({
	completed: [],
	input: {
		url: input.url,
		durationSec: input.durationSec,
		ratio: input.ratio,
		prompt: input.prompt,
		voiceover: input.voiceover,
		design: input.design,
		templateId: input.templateId,
	},
	research: null,
	theme: null,
	plan: null,
	scenes: [],
	audio: [],
	captions: [],
	video: null,
	versionId: null,
	charge: null,
});

/** Storage layout. Everything lives under the user's folder, so deleting an account removes it all. */
export const keys = {
	temp: (userId: string, jobId: string) => `u/${userId}/tmp/${jobId}/`,
	still: (userId: string, jobId: string, index: number, round: number) =>
		`u/${userId}/tmp/${jobId}/still-${index}-${round}.png`,
	voice: (userId: string, jobId: string, index: number) => `u/${userId}/tmp/${jobId}/vo-${index}.wav`,
	music: (userId: string, jobId: string) => `u/${userId}/tmp/${jobId}/music.mp3`,
	video: (userId: string, jobId: string) => `u/${userId}/v/${jobId}.mp4`,
	poster: (userId: string, jobId: string) => `u/${userId}/v/${jobId}.png`,
};
