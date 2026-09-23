import {RENDER_FPS, type DirectorPlan, type ResearchResult, type SceneBrief} from '@kinetiq/shared';

// Turning what we know about a product into a storyboard (FR-GEN-03).
// Pure and deterministic, so the same site always gives the same structure.
// It is used by the mock provider today, and stays as the fallback for when
// the real model is unavailable or returns something unusable (Phase 9).

export const MIN_SCENE_FRAMES = 30;

type PlanInput = {
	research: ResearchResult;
	durationSec: number;
	voiceover: boolean;
	/** Extra direction from the user's prompt, kept verbatim in the briefs. */
	prompt?: string | null;
};

// How the time is split, as weights. Every video ends on the logo, so the
// middle beats are dropped from the back as the video gets shorter.
const MIDDLE = [
	{purpose: 'hook', weight: 1.1},
	{purpose: 'problem', weight: 0.9},
	{purpose: 'solution', weight: 1.1},
	{purpose: 'feature', weight: 1},
	{purpose: 'demo', weight: 1.3},
	{purpose: 'feature', weight: 1},
	{purpose: 'social_proof', weight: 0.9},
	{purpose: 'cta', weight: 0.9},
] as const satisfies readonly {purpose: SceneBrief['purpose']; weight: number}[];

const END = {purpose: 'logo', weight: 0.7} as const satisfies {purpose: SceneBrief['purpose']; weight: number};

/** Roughly one scene per 4 seconds, between 3 and 9 (the last one is always the logo). */
export const sceneCount = (durationSec: number) =>
	Math.min(MIDDLE.length + 1, Math.max(3, Math.round(durationSec / 4)));

/**
 * Spreads `totalFrames` over the scene weights, never below MIN_SCENE_FRAMES,
 * and gives any rounding remainder to the longest scene so the total matches
 * exactly (FR-GEN-08: the video is the length the user paid for).
 */
export function splitFrames(totalFrames: number, weights: readonly number[]): number[] {
	const sum = weights.reduce((a, b) => a + b, 0);
	const frames = weights.map((w) => Math.max(MIN_SCENE_FRAMES, Math.round((totalFrames * w) / sum)));
	let drift = totalFrames - frames.reduce((a, b) => a + b, 0);
	// Hand the difference to the scenes that can afford it, longest first.
	const order = frames.map((f, i) => i).sort((a, b) => frames[b]! - frames[a]!);
	for (const i of order) {
		if (drift === 0) break;
		const next = Math.max(MIN_SCENE_FRAMES, frames[i]! + drift);
		drift -= next - frames[i]!;
		frames[i] = next;
	}
	return frames;
}

const sentence = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

/** One line of narration per scene, written from the site's own words. */
function narration(
	purpose: SceneBrief['purpose'],
	research: ResearchResult,
	feature?: ResearchResult['features'][number],
) {
	const name = research.productName;
	switch (purpose) {
		case 'hook':
			return sentence(research.tagline || `Meet ${name}.`, 140);
		case 'problem':
			return sentence(research.audience ? `Built for ${research.audience}.` : 'Getting this right takes hours.', 140);
		case 'solution':
			return sentence(research.description || `${name} does it for you.`, 140);
		case 'demo':
			return sentence(`Here is ${name} in action.`, 140);
		case 'social_proof':
			return sentence(`Teams ship faster with ${name}.`, 140);
		case 'cta':
			return sentence(`Try ${name} today.`, 140);
		case 'logo':
			return sentence(name, 140);
		default:
			return sentence(feature ? `${feature.title}. ${feature.description}` : `${name}.`, 140);
	}
}

/**
 * On-screen text per scene. Each scene says something new: the tagline opens
 * the video, then the audience, the product's own description and its features.
 */
function onScreen(
	purpose: SceneBrief['purpose'],
	research: ResearchResult,
	feature?: ResearchResult['features'][number],
) {
	const name = research.productName;
	switch (purpose) {
		case 'hook':
			return [name, sentence(research.tagline, 60)].filter(Boolean);
		case 'problem':
			return research.audience
				? [
						sentence(`Built for ${research.audience}`, 60),
						sentence(research.features[0]?.description ?? '', 90),
					].filter(Boolean)
				: [sentence(`Meet ${name}`, 60)];
		case 'solution':
			return [sentence(research.description || research.tagline || name, 90)];
		case 'social_proof':
			return [sentence(`Why teams choose ${name}`, 60)];
		case 'logo':
			return [name];
		case 'cta':
			return [`Try ${name}`, sentence(research.url.replace(/^https?:\/\//, ''), 60)];
		default:
			return feature
				? [sentence(feature.title, 60), sentence(feature.description, 90)]
				: [sentence(research.tagline || name, 60)];
	}
}

/** Builds the storyboard: which scenes, in which order, how long, and what they say. */
export function planScenes({research, durationSec, voiceover, prompt}: PlanInput): DirectorPlan {
	const count = sceneCount(durationSec);
	const shape = [...MIDDLE.slice(0, count - 1), END];
	const frames = splitFrames(
		durationSec * RENDER_FPS,
		shape.map((s) => s.weight),
	);
	let featureIndex = 0;

	const scenes = shape.map((step, index): SceneBrief => {
		const feature = step.purpose === 'feature' ? research.features[featureIndex++] : undefined;
		const extra = prompt ? ` The user asked: ${sentence(prompt, 300)}` : '';
		return {
			index,
			purpose: step.purpose,
			brief: sentence(
				`${step.purpose} scene for ${research.productName}: ${narration(step.purpose, research, feature)}${extra}`,
				1200,
			),
			durationFrames: frames[index]!,
			onScreenText: onScreen(step.purpose, research, feature),
			voiceoverText: voiceover ? narration(step.purpose, research, feature) : null,
			usesProductUi: step.purpose === 'demo' || step.purpose === 'solution',
		};
	});

	return {title: `${research.productName} — launch video`, scenes};
}

/**
 * Stretches scenes so each one lasts at least as long as its narration
 * (FR-GEN-08). Scene lengths only grow, so nothing is cut off mid-sentence.
 */
export function fitToNarration(plan: DirectorPlan, spokenFrames: readonly number[]): DirectorPlan {
	const scenes = plan.scenes.map((scene, i) => ({
		...scene,
		durationFrames: Math.max(scene.durationFrames, Math.ceil((spokenFrames[i] ?? 0) + RENDER_FPS * 0.4)),
	}));
	return {...plan, scenes};
}
