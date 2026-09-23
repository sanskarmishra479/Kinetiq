import {z} from 'zod';
import {HexColor} from './common.js';

// Structured outputs the pipeline requires from the LLM (NFR-SEC-07).
// Every model response is parsed with these schemas; anything that doesn't
// match is rejected and retried, never trusted.

// ── research node: what we learned from the website ─────────────────────────
export const ResearchResult = z.strictObject({
	url: z.url(),
	productName: z.string().min(1).max(80),
	tagline: z.string().max(200),
	description: z.string().max(2000),
	features: z.array(z.strictObject({title: z.string().min(1).max(80), description: z.string().max(400)})).max(12),
	audience: z.string().max(300).nullable(),
	brand: z.strictObject({
		colors: z.array(HexColor).max(8),
		fonts: z.array(z.string().min(1).max(80)).max(4),
		logoKey: z.string().max(512).nullable(),
	}),
	screenshots: z.array(z.strictObject({key: z.string().min(1).max(512), section: z.string().max(80)})).max(20),
});
export type ResearchResult = z.infer<typeof ResearchResult>;

// ── director node: the storyboard ────────────────────────────────────────────
export const SCENE_PURPOSES = [
	'hook',
	'problem',
	'solution',
	'feature',
	'demo',
	'social_proof',
	'cta',
	'logo',
] as const;

export const SceneBrief = z.strictObject({
	index: z.int().min(0),
	purpose: z.enum(SCENE_PURPOSES),
	brief: z.string().min(1).max(1200),
	durationFrames: z.int().min(15).max(900),
	onScreenText: z.array(z.string().min(1).max(120)).max(8),
	voiceoverText: z.string().max(600).nullable(),
	usesProductUi: z.boolean(),
	/**
	 * Scenes move by default (camera drift, cursor, typing, scroll), which is what makes a
	 * video feel made by a person. `still` is a deliberate choice: the user asked for it, or
	 * the director judged a held shot is right (a dramatic pause, a calm end card).
	 */
	motion: z.enum(['moving', 'still']).default('moving'),
});
export type SceneBrief = z.infer<typeof SceneBrief>;

export const DirectorPlan = z
	.strictObject({
		title: z.string().min(1).max(120),
		scenes: z.array(SceneBrief).min(2).max(12),
	})
	.refine((plan) => plan.scenes.every((s, i) => s.index === i), 'scene indexes must be 0, 1, 2, … in order');
export type DirectorPlan = z.infer<typeof DirectorPlan>;

/** Total length of a plan in frames. */
export const planFrames = (plan: DirectorPlan) => plan.scenes.reduce((sum, s) => sum + s.durationFrames, 0);

// ── visualQA node: problems found in rendered stills ─────────────────────────
export const QA_ISSUE_KINDS = [
	'overflow',
	'cut_off_text',
	'low_contrast',
	'empty_frame',
	'overlap',
	'off_brand',
	/** Nothing moves: the scene holds still (motion rule: something is always moving). */
	'static',
	'other',
] as const;

export const QaReport = z
	.strictObject({
		sceneIndex: z.int().min(0),
		pass: z.boolean(),
		issues: z
			.array(
				z.strictObject({
					kind: z.enum(QA_ISSUE_KINDS),
					severity: z.enum(['low', 'medium', 'high']),
					frame: z.int().min(0),
					description: z.string().min(1).max(400),
				}),
			)
			.max(20),
	})
	.refine(
		(r) => !r.pass || r.issues.every((i) => i.severity !== 'high'),
		'a passing scene cannot have high-severity issues',
	);
export type QaReport = z.infer<typeof QaReport>;

// ── edit classifier: what a chat edit wants to change ───────────────────────
export const EditIntent = z
	.strictObject({
		kind: z.enum(['script', 'scene', 'style', 'voice', 'music', 'format', 'unclear']),
		sceneIndexes: z.array(z.int().min(0)).max(12),
		instruction: z.string().max(1000),
		clarifyingQuestion: z.string().max(300).nullable(),
	})
	.refine((e) => e.kind !== 'scene' || e.sceneIndexes.length > 0, 'a scene edit must name at least one scene')
	.refine((e) => e.kind !== 'unclear' || e.clarifyingQuestion !== null, 'an unclear edit must ask a question');
export type EditIntent = z.infer<typeof EditIntent>;
