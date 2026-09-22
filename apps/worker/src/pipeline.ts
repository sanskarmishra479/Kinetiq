import {PipelineError, type PipelinePort} from './ports.js';

/**
 * Stand-in until the real pipeline exists (TODO Phase 8). It shows the first
 * step in the live pane, then fails; the job's credits are refunded in full.
 */
export function placeholderPipeline(): PipelinePort {
	return {
		async run(ctx) {
			await ctx.step(
				'research',
				async () => undefined,
				() => 'Read the website',
			);
			throw new PipelineError('DEGRADED', 'Video generation is not available yet. Your credits were refunded.');
		},
	};
}
