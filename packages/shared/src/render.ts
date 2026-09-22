import {z} from 'zod';
import {Ratio} from './common.js';

// The render contract between the worker and the renderer (docs/ARCHITECTURE.md §6).
// The worker builds a RenderInput; the renderer (local Chrome or Remotion Lambda)
// validates it again before evaluating any scene code.

export const RENDER_FPS = 30;

/** Pixel size per aspect ratio (FR-GEN-08). */
export const RATIO_SIZE: Record<Ratio, {width: number; height: number}> = {
	'16:9': {width: 1920, height: 1080},
	'9:16': {width: 1080, height: 1920},
	'1:1': {width: 1080, height: 1080},
};

/** A JSON value (scene props are data only, never functions). */
type Json = string | number | boolean | null | Json[] | {[key: string]: Json};
const Json: z.ZodType<Json> = z.lazy(() =>
	z.union([
		z.string().max(10_000),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(Json).max(500),
		z.record(z.string().max(100), Json),
	]),
);

const Theme = z.strictObject({
	bg: z.string().max(100),
	surface: z.string().max(100),
	surfaceAlt: z.string().max(100),
	border: z.string().max(100),
	fg: z.string().max(100),
	muted: z.string().max(100),
	accent: z.string().max(100),
	accentFg: z.string().max(100),
	radius: z.number().min(0).max(48),
	fontFamily: z.string().min(1).max(200),
});

export const RenderScene = z.strictObject({
	id: z.string().min(1).max(40),
	/** Compiled JS from compileScene(), never raw LLM output. */
	code: z.string().min(1).max(200_000),
	durationInFrames: z
		.int()
		.min(1)
		.max(RENDER_FPS * 60),
	props: z.record(z.string().max(100), Json).default({}),
});
export type RenderScene = z.infer<typeof RenderScene>;

/** Only https URLs (or http on localhost for local development). */
const MediaUrl = z
	.url()
	.refine((u) => /^https:\/\//.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u), 'must be https');

export const RenderInput = z.strictObject({
	ratio: Ratio,
	theme: Theme,
	scenes: z.array(RenderScene).min(1).max(20),
	audio: z
		.array(
			z.strictObject({
				src: MediaUrl,
				volume: z.number().min(0).max(1).default(1),
				fromFrame: z.int().min(0).default(0),
			}),
		)
		.max(4)
		.default([]),
	captions: z
		.array(z.strictObject({text: z.string().min(1).max(60), start: z.int().min(0), end: z.int().min(0)}))
		.max(2000)
		.default([]),
	/** Curved-glass finish over the whole video. */
	lens: z.boolean().default(false),
	/**
	 * Origins the page may load images, media and fonts from (the content CDN).
	 * Everything else is blocked by the page's Content-Security-Policy.
	 */
	assetOrigins: z
		.array(z.string().regex(/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i, 'must be an origin like https://cdn.example.com'))
		.max(5)
		.default([]),
});
export type RenderInput = z.input<typeof RenderInput>;
export type ParsedRenderInput = z.infer<typeof RenderInput>;

export const totalFrames = (input: {scenes: {durationInFrames: number}[]}) =>
	input.scenes.reduce((sum, s) => sum + s.durationInFrames, 0);
