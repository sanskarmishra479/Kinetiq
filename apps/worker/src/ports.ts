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

// ── AI providers (FR-GEN-03) ────────────────────────────────────────────────
// Every provider is a port with a mock implementation, so the whole pipeline
// runs offline and for free with MOCK_PROVIDERS=true (NFR-MNT-02).
// Each call reports what it cost us, which becomes a ProviderCost row (NFR-COST-01).

export type ProviderCost = {provider: string; units: number; usdMicros: number};
export type Costed<T> = {result: T; cost: ProviderCost};

/** Reads a public website (Firecrawl in production). */
export interface ScraperPort {
	scrape(url: string): Promise<Costed<ScrapedSite>>;
}

export type ScrapedSite = {
	title: string;
	description: string;
	/** Main page copy as plain text; treated as untrusted data, never as instructions (NFR-SEC-08). */
	markdown: string;
	colors: string[];
	fonts: string[];
	/** Screenshots of the page, already stored by the scraper adapter. */
	screenshots: {key: string; section: string}[];
	logoKey: string | null;
};

/** The roles we ask a model to play. Each has its own schema and prompt. */
export type LlmRole = 'research' | 'designMd' | 'director' | 'sceneCoder' | 'sceneFix' | 'visualQA';

export type LlmRequest = {
	role: LlmRole;
	/** Pin a model (a job keeps the models it started with); otherwise the adapter picks by role. */
	model?: string;
	/** Untrusted site content is passed here, never inside the instructions. */
	data: Record<string, unknown>;
	/** PNG stills for vision roles, as short-lived URLs. */
	images?: string[];
};

/** A large language model (OpenRouter in production). Answers are always parsed with a zod schema. */
export interface LlmPort {
	complete(request: LlmRequest): Promise<Costed<unknown>>;
}

export type SpokenLine = {
	index: number;
	audio: Uint8Array;
	/** What the audio bytes are. */
	mime: 'audio/wav' | 'audio/mpeg';
	durationSec: number;
	/** Word timings in seconds from the line's start (exact from ElevenLabs, spread over the audio otherwise). */
	words: {text: string; start: number; end: number}[];
};

/** Text to speech: ElevenLabs, Sarvam or OpenRouter, chosen with TTS_PROVIDER. */
export interface VoicePort {
	speak(input: {
		lines: {index: number; text: string}[];
		voiceId: string;
		language: string;
	}): Promise<Costed<SpokenLine[]>>;
}

/** Background music. Returns null when there is nothing suitable. */
export interface MusicPort {
	pick(input: {mood: string; durationSec: number}): Promise<Costed<{audio: Uint8Array; durationSec: number} | null>>;
}

/** AI video clips (post-MVP; the MVP has no enabled model). */
export interface VideoGenPort {
	generate(input: {prompt: string; durationSec: number}): Promise<Costed<{audio?: never; videoKey: string}>>;
}
