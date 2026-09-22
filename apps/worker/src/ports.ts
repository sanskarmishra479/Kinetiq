import type {ErrorCode, PipelineNode, ProjectEvent} from '@kinetiq/shared';

// What the worker needs from the outside world, beyond @kinetiq/platform
// (docs/ARCHITECTURE.md §8). Tests pass fakes.

export type PipelineContext = {
	job: {id: string; userId: string; projectId: string};
	/** Aborted when the job is cancelled or passes its deadline. */
	signal: AbortSignal;
	/** Runs one pipeline node: records it on the job and emits step.* events. */
	step<T>(node: PipelineNode, run: () => Promise<T>, summary?: (result: T) => string | undefined): Promise<T>;
	progress(node: PipelineNode, done: number, total: number): Promise<void>;
	emit(event: ProjectEvent): Promise<void>;
};

export type PipelineResult = {
	/** Credits actually used (capped at the reservation; the rest is refunded). */
	charge: number;
};

/** The video pipeline (Phase 8 builds the real one). */
export interface PipelinePort {
	run(ctx: PipelineContext): Promise<PipelineResult>;
}

/** A failure the user should see. Any other error is shown as a generic message. */
export class PipelineError extends Error {
	constructor(
		readonly code: ErrorCode,
		message: string,
	) {
		super(message);
		this.name = 'PipelineError';
	}
}

export type ProbeFacts = {
	durationSec: number | null;
	video: {codec: string; width: number; height: number} | null;
	formats: string[];
};

/** Reads a media file's facts (ffprobe) from a short-lived URL. */
export interface MediaProbePort {
	probe(url: string, mime: 'video/mp4' | 'video/webm'): Promise<ProbeFacts>;
}
