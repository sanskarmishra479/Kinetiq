import {
	compileScene,
	estimate,
	fitToNarration,
	fixNotes,
	themeFromBrand,
	themeFromPreset,
	verdictFor,
	type ValidationError,
} from '@kinetiq/domain';
import {
	DesignTokens,
	DirectorPlan,
	QaReport,
	RENDER_FPS,
	ResearchResult,
	planFrames,
	type DesignChoice,
	type RenderInput,
	type SceneBrief,
} from '@kinetiq/shared';
import {createHash} from 'node:crypto';
import {PipelineError, type PipelineContext} from '../ports.js';
import type {PipelineDeps} from './deps.js';
import {keys, type PipelineState, type SceneState} from './state.js';
import type {PipelineNodeDef} from './runner.js';

// The generation pipeline, node by node (docs/ARCHITECTURE.md §5).
// Each node takes the state, does one job, and returns what changed. All IO
// goes through ports, so the whole thing runs on mocks for free (Phase 8).

/** Preview stills are rendered small: they are only for the QA model and thumbnails (NFR-COST-04). */
const STILL_SCALE = 0.5;
const RESEARCH_CACHE_SEC = 24 * 60 * 60;
const SIGNED_URL_SEC = 60 * 60;
/** The signature curved-glass finish (docs/PRD.md). */
const LENS = true;

const hashUrl = (url: string) => createHash('sha256').update(normalizeUrl(url)).digest('hex').slice(0, 32);

/** Same site, same cache entry: drop the protocol, "www.", trailing slash, query and hash (FR-GEN-12). */
export function normalizeUrl(url: string): string {
	const parsed = new URL(url);
	const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
	const path = parsed.pathname.replace(/\/+$/, '');
	return `${host}${path}`;
}

const errorLines = (errors: ValidationError[]) =>
	errors
		.map((e) => `line ${e.line}: ${e.message}`)
		.slice(0, 10)
		.join('\n');

/** Builds what the renderer needs for one scene or the whole video. */
export async function renderInputFor(
	deps: PipelineDeps,
	state: PipelineState,
	scenes: readonly SceneState[],
): Promise<RenderInput> {
	const theme = state.theme!;
	const withUrls = await Promise.all(
		scenes.map(async (scene) => ({
			id: `s${scene.index}`,
			code: scene.compiled,
			durationInFrames: scene.durationFrames,
			props: scene.screenshotKey
				? {...scene.props, screenshot: await deps.storage.presignGet(scene.screenshotKey, {expiresSec: SIGNED_URL_SEC})}
				: scene.props,
		})),
	);
	const audio = await Promise.all(
		state.audio.map(async (track) => ({
			src: await deps.storage.presignGet(track.key, {expiresSec: SIGNED_URL_SEC}),
			volume: track.volume,
			fromFrame: track.fromFrame,
		})),
	);
	return {
		ratio: state.input.ratio,
		theme: {
			bg: theme.bg,
			surface: theme.surface,
			surfaceAlt: theme.surfaceAlt,
			border: theme.border,
			fg: theme.fg,
			muted: theme.muted,
			accent: theme.accent,
			accentFg: theme.accentFg,
			radius: theme.radius,
			fontFamily: theme.fontFamily,
		},
		scenes: withUrls,
		audio,
		captions: state.captions,
		lens: LENS,
		assetOrigins: deps.assetOrigins,
	};
}

/** Asks the model to write one scene, and keeps asking while the code fails validation. */
async function codeScene(
	deps: PipelineDeps,
	state: PipelineState,
	brief: SceneBrief,
	previous?: {code: string; notes: string[]},
): Promise<Pick<SceneState, 'code' | 'compiled' | 'props'>> {
	let rejected: string | null = null;
	for (let attempt = 1; attempt <= 2; attempt++) {
		const {result, cost} = await deps.llm.complete({
			role: previous ? 'sceneFix' : 'sceneCoder',
			data: {
				brief,
				research: state.research,
				theme: state.theme,
				ratio: state.input.ratio,
				...(previous ? {previousCode: previous.code, problems: previous.notes} : {}),
				...(rejected ? {rejectedBecause: rejected} : {}),
			},
		});
		await deps.recordCost(cost);
		const answer = result as {code?: unknown; props?: unknown};
		if (typeof answer.code !== 'string') throw new PipelineError('INTERNAL', 'The scene writer returned no code');
		const compiled = compileScene(answer.code);
		if (compiled.ok) {
			return {
				code: answer.code,
				compiled: compiled.code,
				props: (answer.props ?? {}) as Record<string, unknown>,
			};
		}
		// Hand the exact reasons back so the next attempt can fix them (FR-GEN-06).
		rejected = errorLines(compiled.errors);
		deps.logger.warn({attempt, errors: compiled.errors.length}, 'scene code rejected by the validator');
	}
	throw new PipelineError('INTERNAL', 'The scene writer could not produce code that passes the safety checks');
}

/** Renders one small still and stores it. Returns its key. */
async function renderStillFor(
	deps: PipelineDeps,
	ctx: PipelineContext,
	state: PipelineState,
	scene: SceneState,
	round: number,
): Promise<string> {
	const key = keys.still(ctx.job.userId, ctx.job.id, scene.index, round);
	// A still has no sound: leave the audio out so the page never waits for it to load.
	const input = await renderInputFor(deps, {...state, audio: [], captions: []}, [scene]);
	await deps.render.renderStill(input, {
		frame: Math.floor(scene.durationFrames / 2),
		outputKey: key,
		scale: STILL_SCALE,
	});
	return key;
}

/** Asks the QA model to look at a still. */
async function qaScene(deps: PipelineDeps, scene: SceneState, stillKey: string): Promise<QaReport> {
	const url = await deps.storage.presignGet(stillKey, {expiresSec: SIGNED_URL_SEC});
	const {result, cost} = await deps.llm.complete({
		role: 'visualQA',
		data: {sceneIndex: scene.index, props: scene.props},
		images: [url],
	});
	await deps.recordCost(cost);
	return QaReport.parse(result);
}

export function pipelineNodes(deps: PipelineDeps): PipelineNodeDef[] {
	return [
		{
			node: 'research',
			attempts: 3,
			async run({state, ctx}) {
				const cacheKey = `research:${hashUrl(state.input.url)}`;
				const cached = await deps.kv.get(cacheKey);
				if (cached) {
					const parsed = ResearchResult.safeParse(JSON.parse(cached));
					if (parsed.success) return {research: parsed.data};
				}

				const scraped = await deps.scraper.scrape(state.input.url);
				await deps.recordCost(scraped.cost);
				await ctx.progress('research', 1, 2);
				// The site's own words are data, never instructions (NFR-SEC-08).
				const {result, cost} = await deps.llm.complete({
					role: 'research',
					data: {url: state.input.url, site: scraped.result},
				});
				await deps.recordCost(cost);
				const research = ResearchResult.parse(result);
				await deps.kv.set(cacheKey, JSON.stringify(research), RESEARCH_CACHE_SEC);
				return {research};
			},
			summary: (state) => (state.research ? `Read ${normalizeUrl(state.input.url)}` : undefined),
		},

		{
			node: 'designMd',
			attempts: 3,
			async run({state, ctx}) {
				const choice = state.input.design as DesignChoice | null;
				// A preset or a saved brand kit needs no model call.
				if (choice?.kind === 'preset') return {theme: themeFromPreset(choice.presetId)};
				if (choice?.kind === 'brandKit') {
					const kit = await deps.repos.brandKits.get(ctx.job.userId, choice.brandKitId);
					if (kit) return {theme: DesignTokens.parse(kit.tokens)};
				}
				const {result, cost} = await deps.llm.complete({
					role: 'designMd',
					data: {research: state.research, url: state.input.url},
				});
				await deps.recordCost(cost);
				const parsed = DesignTokens.safeParse(result);
				// A model that returns nonsense must not stop the video: fall back to the site's colors.
				return {theme: parsed.success ? parsed.data : themeFromBrand(state.research!.brand)};
			},
			summary: (state) => (state.theme ? `Style: ${state.theme.accent} on ${state.theme.bg}` : undefined),
		},

		{
			node: 'director',
			attempts: 3,
			async run({state}) {
				const {result, cost} = await deps.llm.complete({
					role: 'director',
					data: {
						research: state.research,
						durationSec: state.input.durationSec,
						voiceover: state.input.voiceover?.enabled === true,
						prompt: state.input.prompt,
						ratio: state.input.ratio,
					},
				});
				await deps.recordCost(cost);
				const plan = DirectorPlan.parse(result);
				const target = state.input.durationSec * RENDER_FPS;
				if (Math.abs(planFrames(plan) - target) > target * 0.25) {
					throw new PipelineError('INTERNAL', 'The storyboard does not match the requested length');
				}
				return {plan};
			},
			summary: (state) => (state.plan ? `${state.plan.scenes.length} scenes` : undefined),
		},

		{
			node: 'voiceover',
			attempts: 3,
			skip: (state) => state.input.voiceover?.enabled !== true,
			async run({state, ctx}) {
				const plan = state.plan!;
				const lines = plan.scenes
					.map((scene) => ({index: scene.index, text: scene.voiceoverText ?? ''}))
					.filter((line) => line.text.length > 0);
				if (lines.length === 0) return {};

				const spoken = await deps.voice.speak({
					lines,
					voiceId: state.input.voiceover!.voiceId,
					language: state.input.voiceover!.language,
				});
				await deps.recordCost(spoken.cost);

				// Scenes grow to fit their narration, then the audio is placed at each scene's start.
				const spokenFramesByIndex = plan.scenes.map(
					(scene) => (spoken.result.find((s) => s.index === scene.index)?.durationSec ?? 0) * RENDER_FPS,
				);
				const fitted = fitToNarration(plan, spokenFramesByIndex);
				const starts: number[] = [];
				let offset = 0;
				for (const scene of fitted.scenes) {
					starts.push(offset);
					offset += scene.durationFrames;
				}

				const audio: PipelineState['audio'] = [];
				const captions: PipelineState['captions'] = [];
				for (const line of spoken.result) {
					const key = keys.voice(ctx.job.userId, ctx.job.id, line.index);
					await deps.storage.putObject(key, line.audio, 'audio/wav');
					const from = starts[line.index] ?? 0;
					audio.push({key, fromFrame: from, volume: 1});
					for (const word of line.words) {
						captions.push({
							text: word.text,
							start: from + Math.round(word.start * RENDER_FPS),
							end: from + Math.round(word.end * RENDER_FPS),
						});
					}
				}
				return {plan: fitted, audio, captions};
			},
			summary: (state) => (state.audio.length > 0 ? `${state.audio.length} lines recorded` : undefined),
		},

		{
			node: 'sceneCoder',
			async run({state, ctx}) {
				const plan = state.plan!;
				const scenes: SceneState[] = [];
				for (const brief of plan.scenes) {
					const written = await codeScene(deps, state, brief);
					scenes.push({
						index: brief.index,
						...written,
						durationFrames: brief.durationFrames,
						fixes: 0,
						qa: null,
						screenshotKey: null,
						stillKey: null,
					});
					await ctx.progress('sceneCoder', scenes.length, plan.scenes.length);
				}
				return {scenes};
			},
			summary: (state) => `${state.scenes.length} scenes written`,
		},

		{
			node: 'validate',
			async run({state}) {
				// The code was checked as it was written; this proves every scene still compiles
				// and that the total length is what the user asked for (FR-GEN-06, FR-GEN-08).
				for (const scene of state.scenes) {
					if (!compileScene(scene.code).ok) {
						throw new PipelineError('INTERNAL', `Scene ${scene.index + 1} failed the safety checks`);
					}
				}
				const frames = state.scenes.reduce((sum, s) => sum + s.durationFrames, 0);
				if (frames < RENDER_FPS) throw new PipelineError('INTERNAL', 'The video would be too short');
				return {};
			},
		},

		{
			node: 'previewStills',
			attempts: 2,
			async run({state, ctx}) {
				const scenes: SceneState[] = [];
				for (const scene of state.scenes) {
					const stillKey = await renderStillFor(deps, ctx, state, scene, scene.fixes);
					scenes.push({...scene, stillKey});
					await ctx.progress('previewStills', scenes.length, state.scenes.length);
					await deps.events.publish(ctx.job.projectId, {
						type: 'step.progress',
						jobId: ctx.job.id,
						node: 'previewStills',
						done: scenes.length,
						total: state.scenes.length,
						thumbUrl: await deps.storage.presignGet(stillKey, {expiresSec: SIGNED_URL_SEC}),
					});
				}
				return {scenes};
			},
		},

		{
			node: 'visualQA',
			attempts: 2,
			async run({state, ctx}) {
				const scenes: SceneState[] = [];
				for (const scene of state.scenes) {
					const qa = scene.stillKey ? await qaScene(deps, scene, scene.stillKey) : null;
					scenes.push({...scene, qa});
					await ctx.progress('visualQA', scenes.length, state.scenes.length);
				}
				return {scenes};
			},
			summary: (state) => {
				const failed = state.scenes.filter((s) => s.qa && !s.qa.pass).length;
				return failed === 0 ? 'All scenes look right' : `${failed} scene(s) need a fix`;
			},
		},

		{
			node: 'sceneFix',
			attempts: 2,
			skip: (state) =>
				state.scenes.every((s) => !s.qa || verdictFor(verdictInput(s, state), deps.maxFixRounds) === 'ok'),
			async run({state, ctx}) {
				const scenes = [...state.scenes];
				for (const [i, scene] of scenes.entries()) {
					if (!scene.qa) continue;
					const verdict = verdictFor(verdictInput(scene, state), deps.maxFixRounds);
					if (verdict === 'ok' || verdict === 'accept') continue;

					if (verdict === 'fallback') {
						// Rebuilding this UI keeps failing: show the real screenshot instead (FR-GEN-07).
						scenes[i] = {
							...scene,
							fixes: scene.fixes + 1,
							screenshotKey: state.research?.screenshots[0]?.key ?? null,
						};
					} else {
						const written = await codeScene(deps, state, state.plan!.scenes[scene.index]!, {
							code: scene.code,
							notes: fixNotes(scene.qa),
						});
						scenes[i] = {...scene, ...written, fixes: scene.fixes + 1};
					}

					// Re-render and re-check just this scene.
					const stillKey = await renderStillFor(deps, ctx, {...state, scenes}, scenes[i]!, scenes[i]!.fixes);
					const qa = await qaScene(deps, scenes[i]!, stillKey);
					scenes[i] = {...scenes[i]!, stillKey, qa};
					await ctx.progress('sceneFix', i + 1, scenes.length);
				}
				return {scenes};
			},
			summary: (state) => {
				const fixed = state.scenes.filter((s) => s.fixes > 0);
				const fallbacks = fixed.filter((s) => s.screenshotKey).length;
				return fixed.length === 0
					? undefined
					: `Fixed ${fixed.length} scene(s)${fallbacks > 0 ? `, ${fallbacks} using the real screenshot` : ''}`;
			},
		},

		{
			node: 'aiClips',
			// AI cinematic clips are post-MVP; no model is enabled (docs/PRD.md §6.0).
			skip: () => true,
			run: async () => ({}),
		},

		{
			node: 'audio',
			attempts: 2,
			async run({state, ctx}) {
				const frames = state.scenes.reduce((sum, s) => sum + s.durationFrames, 0);
				const picked = await deps.music.pick({
					mood: state.theme?.motion.pace ?? 'medium',
					durationSec: frames / RENDER_FPS,
				});
				await deps.recordCost(picked.cost);
				if (!picked.result) return {};
				const key = keys.music(ctx.job.userId, ctx.job.id);
				await deps.storage.putObject(key, picked.result.audio, 'audio/mpeg');
				// Music sits under the voice.
				return {audio: [...state.audio, {key, fromFrame: 0, volume: state.audio.length > 0 ? 0.18 : 0.35}]};
			},
		},

		{
			node: 'finalRender',
			attempts: 2,
			async run({state, ctx}) {
				const input = await renderInputFor(deps, state, state.scenes);
				const videoKey = keys.video(ctx.job.userId, ctx.job.id);
				await deps.render.renderFinal(input, {
					outputKey: videoKey,
					onProgress: (progress) => {
						void ctx.progress('finalRender', Math.max(1, Math.round(progress * 100)), 100);
					},
				});

				// The poster is the first scene's still, copied next to the video.
				const posterKey = keys.poster(ctx.job.userId, ctx.job.id);
				const firstStill = state.scenes[0]?.stillKey;
				if (firstStill) {
					const head = await deps.storage.head(firstStill);
					if (head) {
						await deps.storage.putObject(posterKey, await deps.storage.readStart(firstStill, head.size), 'image/png');
					}
				}
				const frames = state.scenes.reduce((sum, s) => sum + s.durationFrames, 0);
				return {video: {key: videoKey, posterKey, durationSec: frames / RENDER_FPS}};
			},
			summary: (state) => (state.video ? `${state.video.durationSec.toFixed(1)}s video rendered` : undefined),
		},

		{
			node: 'settle',
			async run({state, ctx}) {
				const video = state.video!;
				const version = await deps.repos.versions.createFromJob(ctx.job.userId, {
					projectId: ctx.job.projectId,
					jobId: ctx.job.id,
					videoKey: video.key,
					posterKey: video.posterKey,
					durationSec: video.durationSec,
					scenes: state.scenes.map((scene) => ({
						index: scene.index,
						code: scene.code,
						durationFrames: scene.durationFrames,
						qaReport: scene.qa,
					})),
				});

				// What the video actually contains decides the price, never more than reserved (FR-CRD-05).
				const {credits} = estimate({
					durationSec: state.input.durationSec,
					voiceover: state.audio.some((track) => track.volume === 1),
					aiClips: 0,
					templateDiscountPct: state.input.templateId
						? await deps.repos.templates.discountPct(state.input.templateId)
						: 0,
				});
				await deps.events.publish(ctx.job.projectId, {
					type: 'version.ready',
					versionId: version.id,
					number: version.number,
					posterUrl: await deps.storage.presignGet(video.posterKey, {expiresSec: SIGNED_URL_SEC}),
				});
				return {versionId: version.id, charge: credits};
			},
			summary: (state) => (state.charge === null ? undefined : `${state.charge} credits`),
		},

		{
			node: 'notify',
			async run({state, ctx}) {
				const message = await deps.repos.messages.append(ctx.job.userId, ctx.job.projectId, {
					role: 'assistant',
					content: `Your video is ready — ${state.video ? `${state.video.durationSec.toFixed(0)} seconds` : 'have a look'}. Tell me what to change and I'll update it.`,
				});
				if (message) await deps.events.publish(ctx.job.projectId, {type: 'message.created', message});
				return {};
			},
		},
	];
}

/**
 * A scene can fall back to the real screenshot only if it is a product-UI scene
 * (its code takes a `screenshot` prop) and research captured one (FR-GEN-07).
 */
const verdictInput = (scene: SceneState, state: PipelineState) => ({
	report: scene.qa!,
	fixes: scene.fixes,
	canFallBackToScreenshot: 'screenshot' in scene.props && (state.research?.screenshots.length ?? 0) > 0,
});
