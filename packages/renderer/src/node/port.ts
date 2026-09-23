import type {RenderInput} from '@kinetiq/shared';

// How the worker renders (docs/ARCHITECTURE.md §6). Adapters:
// - localRender: Chrome on this machine, for development only
// - lambdaRender: Remotion Lambda (Phase 12), the only mode allowed in production

export type RenderResult = {key: string; bytes: number};

export interface RenderPort {
	/** One frame as PNG (preview stills for visual QA). `scale` renders smaller, which is cheaper. */
	renderStill(input: RenderInput, opts: {frame: number; outputKey: string; scale?: number}): Promise<RenderResult>;
	/** The full MP4 (H.264 + AAC). */
	renderFinal(
		input: RenderInput,
		opts: {outputKey: string; onProgress?: (progress: number) => void},
	): Promise<RenderResult>;
}

export type RenderErrorCode =
	/** A scene's code failed; `sceneId` says which, so the fix loop can repair it. */
	| 'SCENE_ERROR'
	/** The render took too long (e.g. an endless loop in a scene). */
	| 'TIMEOUT'
	/** The input doesn't match the render contract. */
	| 'INVALID_INPUT'
	/** Anything else (browser crash, encoder failure). */
	| 'RENDERER';

export class RenderError extends Error {
	constructor(
		readonly code: RenderErrorCode,
		message: string,
		readonly sceneId: string | null = null,
	) {
		super(message);
		this.name = 'RenderError';
	}
}

/** Maps any failure from the renderer to a RenderError (pure; unit-tested). */
export function toRenderError(error: unknown, timedOut: boolean): RenderError {
	if (error instanceof RenderError) return error;
	const message = error instanceof Error ? error.message : String(error);
	if (timedOut) return new RenderError('TIMEOUT', 'The render took too long and was stopped');
	const scene = /\[scene:([A-Za-z0-9_-]{1,40})\]\s*([^\n]*)/.exec(message);
	if (scene) return new RenderError('SCENE_ERROR', scene[2]!.slice(0, 500), scene[1]!);
	if (/delayRender|timed? ?out|timeout/i.test(message)) {
		return new RenderError('TIMEOUT', 'The render took too long and was stopped');
	}
	return new RenderError('RENDERER', message.split('\n')[0]!.slice(0, 500));
}
