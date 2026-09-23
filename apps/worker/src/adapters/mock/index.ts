import {estimateWordTimings, planScenes, spokenFrames, themeFromBrand} from '@kinetiq/domain';
import type {StoragePort} from '@kinetiq/platform';
import {DirectorPlan, QaReport, RENDER_FPS, ResearchResult, SceneBrief, type DesignTokens} from '@kinetiq/shared';
import {readFileSync} from 'node:fs';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import type {
	Costed,
	LlmPort,
	LlmRequest,
	MusicPort,
	ScrapedSite,
	ScraperPort,
	SpokenLine,
	VoicePort,
} from '../../ports.js';
import {propsFor, SCENE_TEMPLATES, templateFor} from './scene-templates.js';

// Mock providers: the whole pipeline runs offline and free with
// MOCK_PROVIDERS=true (NFR-MNT-02, docs/TODO.md Phase 8).
// They are deterministic — the same site always gives the same video — so
// tests assert on real output instead of whatever a model felt like saying.

const FIXTURES = fileURLToPath(new URL('../../fixtures/', import.meta.url));
const free = {provider: 'mock', units: 0, usdMicros: 0};
const costed = <T>(result: T): Costed<T> => ({result, cost: free});

type SiteFixture = {
	host: string;
	title: string;
	description: string;
	markdown: string;
	colors: string[];
	fonts: string[];
	audience: string;
	features: {title: string; description: string}[];
};

let cache: Map<string, SiteFixture> | undefined;

/** The ten "golden" startups the pipeline is developed and tested against. */
export function siteFixtures(): Map<string, SiteFixture> {
	if (!cache) {
		cache = new Map();
		for (const file of readdirSync(join(FIXTURES, 'sites'))) {
			const site = JSON.parse(readFileSync(join(FIXTURES, 'sites', file), 'utf8')) as SiteFixture;
			cache.set(site.host, site);
		}
	}
	return cache;
}

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, '');

/** A stable number from a string, for sites that aren't in the fixtures. */
function hashOf(text: string): number {
	let hash = 2166136261;
	for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
	return hash;
}

/** Makes up a believable site for any URL that isn't a fixture. */
function inventedSite(url: string): SiteFixture {
	const host = hostOf(url);
	const name = (host.split('.')[0] ?? 'product').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	const palettes = ['#6d5efc', '#1fbf75', '#3f8cff', '#ff5d5d', '#ffb443'];
	const accent = palettes[hashOf(host) % palettes.length]!;
	return {
		host,
		title: `${name} — the faster way to work`,
		description: `${name} helps teams do their best work with less busywork.`,
		markdown: `# ${name}\n\nThe faster way to work.\n`,
		colors: ['#0b0b10', accent, '#f5f5f7'],
		fonts: ['Inter'],
		audience: 'growing teams',
		features: [
			{title: 'Set up in minutes', description: `Connect your tools and ${name} does the rest.`},
			{title: 'Built for teams', description: 'Everyone sees the same source of truth.'},
			{title: 'Fair pricing', description: 'Start free, grow when you are ready.'},
		],
	};
}

export function mockScraper(storage: StoragePort): ScraperPort {
	const screenshot = readFileSync(join(FIXTURES, 'screenshot.png'));
	return {
		async scrape(url) {
			const host = hostOf(url);
			const site = siteFixtures().get(host) ?? inventedSite(url);
			const key = `scrape/${host}/home.png`;
			await storage.putObject(key, new Uint8Array(screenshot), 'image/png');
			const result: ScrapedSite = {
				title: site.title,
				description: site.description,
				markdown: site.markdown,
				colors: site.colors,
				fonts: site.fonts,
				screenshots: [{key, section: 'home'}],
				logoKey: null,
			};
			return costed(result);
		},
	};
}

export type MockLlmOptions = {
	/** Lets a test script QA results per scene and round (default: everything passes). */
	qa?: (input: {sceneIndex: number; round: number}) => QaReport;
	/** Lets a test make a role fail, to exercise retries. */
	fail?: (role: LlmRequest['role'], callIndex: number) => Error | null;
};

/**
 * A stand-in for the real model. Each role answers with the same shape the
 * real one must produce, built by the pure planners in @kinetiq/domain.
 */
export function mockLlm(options: MockLlmOptions = {}): LlmPort & {calls: LlmRequest['role'][]} {
	const calls: LlmRequest['role'][] = [];
	const qaRounds = new Map<number, number>();

	return {
		calls,
		async complete(request) {
			const failure = options.fail?.(request.role, calls.filter((r) => r === request.role).length);
			calls.push(request.role);
			if (failure) throw failure;

			switch (request.role) {
				case 'research': {
					const site = request.data.site as ScrapedSite;
					const url = request.data.url as string;
					const host = hostOf(url);
					const fixture = siteFixtures().get(host) ?? inventedSite(url);
					const research: ResearchResult = {
						url,
						productName: site.title.split('—')[0]!.trim() || host,
						tagline: site.title.split('—')[1]?.trim() ?? fixture.title,
						description: site.description,
						features: fixture.features,
						audience: fixture.audience,
						brand: {colors: site.colors, fonts: site.fonts, logoKey: site.logoKey},
						screenshots: site.screenshots,
					};
					return costed(ResearchResult.parse(research));
				}

				case 'designMd': {
					const research = ResearchResult.parse(request.data.research);
					const tokens: DesignTokens = themeFromBrand(research.brand);
					return costed(tokens);
				}

				case 'director': {
					const research = ResearchResult.parse(request.data.research);
					const plan = planScenes({
						research,
						durationSec: request.data.durationSec as number,
						voiceover: request.data.voiceover === true,
						prompt: (request.data.prompt as string | null) ?? null,
					});
					return costed(DirectorPlan.parse(plan));
				}

				case 'sceneCoder':
				case 'sceneFix': {
					const brief = SceneBrief.parse(request.data.brief);
					const research = ResearchResult.parse(request.data.research);
					const template = templateFor(brief);
					return costed({
						code: SCENE_TEMPLATES[template],
						props: propsFor(brief, research, template),
					});
				}

				case 'visualQA': {
					const sceneIndex = request.data.sceneIndex as number;
					const round = (qaRounds.get(sceneIndex) ?? 0) + 1;
					qaRounds.set(sceneIndex, round);
					const report = options.qa?.({sceneIndex, round}) ?? {sceneIndex, pass: true, issues: []};
					return costed(QaReport.parse(report));
				}
			}
		},
	};
}

/** Silent speech of the right length, with word timings, so captions and timing are real. */
export function mockVoice(): VoicePort {
	return {
		async speak({lines}) {
			const spoken: SpokenLine[] = lines.map((line) => {
				const frames = Math.max(RENDER_FPS, spokenFrames(line.text));
				const durationSec = frames / RENDER_FPS;
				return {
					index: line.index,
					audio: silentWav(durationSec),
					durationSec,
					words: estimateWordTimings(line.text).map((w) => ({
						text: w.text,
						start: w.start / RENDER_FPS,
						end: w.end / RENDER_FPS,
					})),
				};
			});
			return costed(spoken);
		},
	};
}

/** No music in mock mode: the real library arrives with the providers (Phase 9). */
export const mockMusic = (): MusicPort => ({pick: async () => costed(null)});

/** A silent 24 kHz mono WAV, so the mix and the encoder do real work. */
export function silentWav(durationSec: number, sampleRate = 24_000): Uint8Array {
	const samples = Math.max(1, Math.round(durationSec * sampleRate));
	const buffer = new ArrayBuffer(44 + samples * 2);
	const view = new DataView(buffer);
	const ascii = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
	};
	ascii(0, 'RIFF');
	view.setUint32(4, 36 + samples * 2, true);
	ascii(8, 'WAVEfmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	ascii(36, 'data');
	view.setUint32(40, samples * 2, true);
	return new Uint8Array(buffer);
}
