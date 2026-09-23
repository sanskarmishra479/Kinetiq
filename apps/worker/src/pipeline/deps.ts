import type {EventBusPort, KvPort, StoragePort} from '@kinetiq/platform';
import type {Repos} from '@kinetiq/db';
import type {RenderPort} from '@kinetiq/renderer/node';
import type {Logger} from 'pino';
import type {LlmPort, MusicPort, ProviderCost, ScraperPort, VoicePort} from '../ports.js';

/** Everything the pipeline nodes are allowed to touch. Tests pass fakes for all of it. */
export type PipelineDeps = {
	repos: Repos;
	storage: StoragePort;
	events: EventBusPort;
	render: RenderPort;
	kv: KvPort;
	llm: LlmPort;
	scraper: ScraperPort;
	voice: VoicePort;
	music: MusicPort;
	logger: Logger;
	/** Origins the render page may load images and audio from (NFR-SEC-12). */
	assetOrigins: string[];
	/** How many times a scene may be re-written after visual QA (NFR-COST-04). */
	maxFixRounds: number;
	/** Records what a provider call cost us (NFR-COST-01). */
	recordCost(cost: ProviderCost): Promise<void>;
};
