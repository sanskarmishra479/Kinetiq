import {MAX_FIX_ROUNDS} from '@kinetiq/domain';
import {PipelineError, type PipelinePort} from '../ports.js';
import type {PipelineDeps} from './deps.js';
import {pipelineNodes} from './nodes.js';
import {runPipeline, type CheckpointStore} from './runner.js';
import {initialState, keys, PipelineState, type JobInput} from './state.js';

// The generation pipeline as a PipelinePort, ready for the worker to run
// (docs/ARCHITECTURE.md §5). Everything it talks to is a port, so the mock
// providers give the same behaviour for free (Phase 8).

export {pipelineNodes, renderInputFor, normalizeUrl} from './nodes.js';
export {runPipeline, type CheckpointStore, type PipelineNodeDef} from './runner.js';
export {initialState, keys, PipelineState, type JobInput, type SceneState} from './state.js';
export type {PipelineDeps} from './deps.js';

export type GenerationPipelineOptions = {
	deps: Omit<PipelineDeps, 'maxFixRounds' | 'recordCost'> & {maxFixRounds?: number};
	/** Base wait between node retries; tests set it to 0. */
	retryDelayMs?: number;
};

export function generationPipeline({deps: given, retryDelayMs}: GenerationPipelineOptions): PipelinePort {
	return {
		async run(ctx) {
			const deps: PipelineDeps = {
				...given,
				maxFixRounds: given.maxFixRounds ?? MAX_FIX_ROUNDS,
				recordCost: (cost) => given.repos.costs.record(ctx.job.id, cost),
			};
			const input = await loadJobInput(deps, ctx.job);
			const checkpoints = checkpointStore(deps);
			const saved = await checkpoints.load(ctx.job.id);
			const state = await runPipeline(pipelineNodes(deps), saved ?? initialState(input), {
				jobId: ctx.job.id,
				ctx,
				checkpoints,
				...(retryDelayMs === undefined ? {} : {retryDelayMs}),
				onNodeError: (node, attempt, error) => deps.logger.warn({err: error, node, attempt}, 'pipeline node failed'),
			});

			// The video exists: drop the working files and the saved state.
			await Promise.allSettled([
				checkpoints.clear(ctx.job.id),
				deps.storage.deletePrefix(keys.temp(ctx.job.userId, ctx.job.id)),
			]);
			return {charge: state.charge ?? 0};
		},
	};
}

/** Reads the project's settings; this is what the pipeline works from. */
async function loadJobInput(
	deps: PipelineDeps,
	job: {id: string; userId: string; projectId: string},
): Promise<JobInput> {
	const project = await deps.repos.projects.get(job.userId, job.projectId);
	if (!project) throw new PipelineError('NOT_FOUND', 'The project no longer exists');
	const voiceover = project.settings.voiceover;
	return {
		jobId: job.id,
		userId: job.userId,
		projectId: job.projectId,
		url: project.url,
		durationSec: project.durationSec,
		ratio: project.ratio,
		prompt: project.prompt,
		voiceover:
			voiceover?.enabled === true
				? {enabled: true, voiceId: voiceover.voiceId ?? 'sam', language: voiceover.language ?? 'en'}
				: null,
		design: project.settings.design,
		templateId: project.templateId,
	};
}

/** Saved state, checked against the schema: an old or corrupted shape simply starts over. */
function checkpointStore(deps: PipelineDeps): CheckpointStore {
	return {
		async load(jobId) {
			const saved = await deps.repos.checkpoints.load(jobId);
			if (!saved) return null;
			const parsed = PipelineState.safeParse(saved);
			if (parsed.success) return parsed.data;
			deps.logger.warn({jobId}, 'saved pipeline state no longer fits; starting from the beginning');
			return null;
		},
		save: (jobId, node, state) => deps.repos.checkpoints.save(jobId, node, state),
		clear: (jobId) => deps.repos.checkpoints.clear(jobId),
	};
}
