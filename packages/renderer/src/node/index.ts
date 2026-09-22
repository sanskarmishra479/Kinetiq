// Node side of the renderer, used by the worker. Never imported by the render bundle.
import type {LocalRenderOptions} from './local.js';
import {RenderError, type RenderPort} from './port.js';

export {RenderError, toRenderError, type RenderErrorCode, type RenderPort, type RenderResult} from './port.js';
export type {LocalRenderOptions} from './local.js';

/**
 * Local Chrome rendering, loaded on first use so production workers (Lambda
 * mode) never load @remotion/renderer. Refuses to run in production (NFR-SEC-12).
 */
export function localRender(options: LocalRenderOptions): RenderPort {
	if ((options.env ?? process.env).NODE_ENV === 'production') {
		throw new Error('Local rendering is disabled in production; use RENDER_MODE=lambda (NFR-SEC-12)');
	}
	let port: Promise<RenderPort> | undefined;
	const get = () => (port ??= import('./local.js').then((m) => m.localRender(options)));
	return {
		renderStill: async (input, opts) => (await get()).renderStill(input, opts),
		renderFinal: async (input, opts) => (await get()).renderFinal(input, opts),
	};
}

/** Placeholder until Remotion Lambda is wired (TODO Phase 12). */
export function unavailableRender(reason: string): RenderPort {
	const fail = async (): Promise<never> => {
		throw new RenderError('RENDERER', reason);
	};
	return {renderStill: fail, renderFinal: fail};
}
