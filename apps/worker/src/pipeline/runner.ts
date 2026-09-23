import type {PipelineNode} from '@kinetiq/shared';
import type {PipelineContext} from '../ports.js';
import type {PipelineState} from './state.js';

// Runs the nodes in order and saves the state after each one (FR-GEN-05).
// - A node that already finished is skipped when a job is retried.
// - A failing node is retried a few times before the job gives up; earlier
//   nodes are never re-run, so we never pay twice for the same work.
// - Every node reports itself through ctx.step, which is what the browser
//   shows live (FR-GEN-04).

export type NodeRun = {
	state: PipelineState;
	ctx: PipelineContext;
	/** Attempt number, starting at 1; useful for logging and prompts. */
	attempt: number;
};

export type PipelineNodeDef = {
	node: PipelineNode;
	/** How many times to try this node before failing the job. */
	attempts?: number;
	/** True when this node has nothing to do for this job (e.g. no voiceover). */
	skip?: (state: PipelineState) => boolean;
	run: (run: NodeRun) => Promise<Partial<PipelineState>>;
	/** Short line for the live pane when the node finishes. */
	summary?: (state: PipelineState) => string | undefined;
};

export interface CheckpointStore {
	load(jobId: string): Promise<PipelineState | null>;
	save(jobId: string, node: PipelineNode, state: PipelineState): Promise<void>;
	clear(jobId: string): Promise<void>;
}

export type RunOptions = {
	jobId: string;
	ctx: PipelineContext;
	checkpoints: CheckpointStore;
	/** Base wait between retries, doubled each time. */
	retryDelayMs?: number;
	onNodeError?: (node: PipelineNode, attempt: number, error: unknown) => void;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runPipeline(
	defs: readonly PipelineNodeDef[],
	start: PipelineState,
	options: RunOptions,
): Promise<PipelineState> {
	const {jobId, ctx, checkpoints} = options;
	const delay = options.retryDelayMs ?? 1000;
	let state = start;

	for (const def of defs) {
		if (state.completed.includes(def.node)) continue;
		if (def.skip?.(state)) {
			state = {...state, completed: [...state.completed, def.node]};
			await checkpoints.save(jobId, def.node, state);
			continue;
		}

		const patch = await ctx.step(
			def.node,
			async () => {
				const attempts = def.attempts ?? 1;
				for (let attempt = 1; ; attempt++) {
					try {
						return await def.run({state, ctx, attempt});
					} catch (error) {
						options.onNodeError?.(def.node, attempt, error);
						if (attempt >= attempts || ctx.signal.aborted) throw error;
						await sleep(delay * 2 ** (attempt - 1));
					}
				}
			},
			() => def.summary?.(state),
		);

		state = {...state, ...patch, completed: [...state.completed, def.node]};
		await checkpoints.save(jobId, def.node, state);
	}

	return state;
}
