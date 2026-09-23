import {createDb, createIdGenerator, createRepos} from '@kinetiq/db';
import {memoryEventBus, memoryKv, s3Storage} from '@kinetiq/platform';
import {localRender} from '@kinetiq/renderer/node';
import {loadConfig, QaReport} from '@kinetiq/shared';
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {pino} from 'pino';
import {mockLlm, mockMusic, mockScraper, mockVoice, siteFixtures} from '../adapters/mock/index.js';
import {alwaysMoving, pngMotion} from '../adapters/motion.js';
import {realProviders} from '../container.js';
import {generationPipeline} from '../pipeline/index.js';
import {PROMPT_VERSION} from '../prompts/index.js';
import type {LlmPort} from '../ports.js';
import {fakeRender} from '../testing/index.js';
import {report, type EvalRun} from './metrics.js';

// Pipeline benchmark (docs/TODO.md Phase 9): makes a video for each golden
// site and reports how often scene code passes first try, how often QA
// passes, frozen scenes, time and cost per video. Use it to compare models
// before switching, and to tune JOB_DEADLINE_MINUTES and MIN_MOTION_RATIO.
//
//   pnpm --filter @kinetiq/worker eval -- --sites 3 --scraper mock --render fake
//
// --scraper mock  uses the 10 fixture sites (only an OpenRouter key needed)
// --render fake   skips rendering (fast; QA and the motion check are not measured)
// --render local  renders for real (slow, but measures QA and frozen scenes)
// With real providers it spends money, so it asks for --yes.

const {values} = parseArgs({
	// pnpm passes the "--" separator through; ignore it.
	args: process.argv.slice(2).filter((arg) => arg !== '--'),
	options: {
		sites: {type: 'string', default: '3'},
		scraper: {type: 'string', default: 'real'},
		render: {type: 'string', default: 'fake'},
		duration: {type: 'string', default: '15'},
		voiceover: {type: 'boolean', default: false},
		yes: {type: 'boolean', default: false},
		/** Save each finished video (MP4, poster, frame sheet) to out/videos/. */
		keep: {type: 'boolean', default: false},
		/** Stop when AI spending in this run passes this many dollars. */
		'max-usd': {type: 'string', default: '2'},
	},
});

// With the fixture scraper, Firecrawl is never called: its key isn't needed.
const config = loadConfig(
	values.scraper === 'mock'
		? {...process.env, FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY || 'not-used-with-mock-scraper'}
		: process.env,
);
if (config.APP_ENV !== 'local') throw new Error('The benchmark only runs locally (APP_ENV=local).');
const real = !config.MOCK_PROVIDERS;
if (real && !values.yes) {
	console.error(
		`This run uses real providers (models from .env) and spends money on each video.\nRe-run with --yes to continue, or set MOCK_PROVIDERS=true for a free dry run.`,
	);
	process.exit(1);
}
const durationSec = Number(values.duration) as 15 | 30 | 45;
if (![15, 30, 45].includes(durationSec)) throw new Error('--duration must be 15, 30 or 45');

const GOLDEN = fileURLToPath(new URL('./golden-sites.json', import.meta.url));
const sites =
	values.scraper === 'mock'
		? [...siteFixtures().keys()].map((host) => `https://${host}`)
		: (JSON.parse(readFileSync(GOLDEN, 'utf8')) as string[]);
const chosen = sites.slice(0, Number(values.sites));

const db = createDb(config.DATABASE_URL);
const ids = createIdGenerator();
const clock = {now: () => Date.now()};
const repos = createRepos({db, ids, clock});
const storage = s3Storage({
	endpoint: config.S3_ENDPOINT,
	region: config.S3_REGION,
	accessKeyId: config.S3_ACCESS_KEY_ID,
	secretAccessKey: config.S3_SECRET_ACCESS_KEY,
	bucket: config.S3_BUCKET_CONTENT,
});
const providers = real
	? realProviders(config, storage)
	: {llm: mockLlm(), scraper: mockScraper(storage), voice: mockVoice(), music: mockMusic(), models: null};
const scraper = values.scraper === 'mock' ? mockScraper(storage) : providers.scraper;
const rendering = values.render === 'local';

const maxUsdMicros = Math.round(Number(values['max-usd']) * 1_000_000);
let spentUsdMicros = 0;

/** Wraps the model to count scene writes, fixes and QA findings for one run, and to enforce the budget. */
function instrument(llm: LlmPort, run: EvalRun): LlmPort {
	return {
		async complete(request) {
			if (spentUsdMicros >= maxUsdMicros) {
				throw new Error(
					`budget reached: $${(spentUsdMicros / 1e6).toFixed(2)} of $${values['max-usd']} (raise --max-usd to continue)`,
				);
			}
			// Without real renders there is no real still for the vision model: QA isn't measured.
			if (request.role === 'visualQA' && !rendering) {
				return {
					result: {sceneIndex: request.data.sceneIndex, pass: true, issues: []},
					cost: {provider: 'skipped', units: 0, usdMicros: 0},
				};
			}
			if (request.role === 'sceneCoder') run.sceneWrites++;
			if (request.role === 'sceneFix') run.sceneFixes++;
			const answer = await llm.complete(request);
			spentUsdMicros += answer.cost.usdMicros;
			if (request.role === 'visualQA') {
				for (const issue of QaReport.parse(answer.result).issues)
					run.qaIssues[issue.kind] = (run.qaIssues[issue.kind] ?? 0) + 1;
			}
			return answer;
		},
	};
}

const VIDEOS = fileURLToPath(new URL('../../../../out/videos/', import.meta.url));

/** Copies the finished video out of storage before the benchmark cleans up, plus a frame sheet to glance at. */
async function keepVideo(jobId: string, site: string): Promise<string> {
	const version = await db.version.findFirstOrThrow({where: {jobId}});
	mkdirSync(VIDEOS, {recursive: true});
	const name = `${new URL(site).hostname.replace(/^www\./, '')}-${new Date().toISOString().replaceAll(':', '-').slice(0, 19)}`;
	const read = async (key: string) => {
		const head = await storage.head(key);
		return head ? storage.readStart(key, head.size) : null;
	};
	const video = await read(version.videoKey!);
	if (!video) throw new Error('the finished video is missing from storage');
	const mp4 = `${VIDEOS}${name}.mp4`;
	writeFileSync(mp4, video);
	const poster = version.posterKey ? await read(version.posterKey) : null;
	if (poster) writeFileSync(`${VIDEOS}${name}-poster.png`, poster);
	// Two frames a second, tiled: the whole video at a glance.
	execFileSync('ffmpeg', [
		'-v',
		'error',
		'-y',
		'-i',
		mp4,
		'-vf',
		'fps=2,scale=384:-1,tile=5x8:padding=4',
		'-frames:v',
		'1',
		`${VIDEOS}${name}-frames.png`,
	]);
	return mp4;
}

const runs: EvalRun[] = [];
for (const site of chosen) {
	const run: EvalRun = {
		site,
		ok: false,
		error: null,
		seconds: 0,
		steps: {},
		scenes: 0,
		sceneWrites: 0,
		sceneFixes: 0,
		qaIssues: {},
		usdMicros: 0,
		costByProvider: {},
		kept: null,
	};
	const user = await db.user.create({
		data: {id: ids.next('usr'), email: `${ids.next('eval')}@eval.local`, name: 'Benchmark', emailVerified: true},
	});
	const started = Date.now();
	try {
		const project = await repos.projects.create(user.id, {
			url: site,
			durationSec,
			ratio: '16:9',
			assetIds: [],
			prompt: null,
		});
		if (values.voiceover) {
			await repos.projects.updateSettings(user.id, project.id, {
				voiceover: {enabled: true, voiceId: 'kira', language: 'en', scriptBy: 'ai'},
				design: null,
			});
		}
		const job = (await repos.jobs.create(user.id, project.id, {
			type: 'generate',
			reservedCredits: 0,
			deadlineMinutes: 60,
		}))!;
		const pipeline = generationPipeline({
			retryDelayMs: 1000,
			deps: {
				repos,
				storage,
				events: memoryEventBus(),
				kv: memoryKv(),
				logger: pino({level: 'warn'}),
				assetOrigins: [config.CONTENT_ORIGIN],
				render: rendering ? localRender({storage, timeoutMs: 20 * 60_000}) : fakeRender(storage as never),
				motion: rendering ? pngMotion(storage) : alwaysMoving(),
				...providers,
				llm: instrument(providers.llm, run),
				scraper,
			},
		});
		await pipeline.run({
			job: {id: job.id, userId: user.id, projectId: project.id},
			signal: new AbortController().signal,
			emit: async () => {},
			progress: async () => {},
			step: async (node, fn) => {
				const t = Date.now();
				try {
					return await fn();
				} finally {
					run.steps[node] = (Date.now() - t) / 1000;
				}
			},
		});
		run.ok = true;
		run.scenes = await db.scene.count({where: {version: {jobId: job.id}}});
		if (values.keep) run.kept = await keepVideo(job.id, site);
	} catch (error) {
		run.error = (error as Error).message.slice(0, 160);
	} finally {
		// What this video cost, per provider and model (also stored per job in provider_cost).
		const job = await db.job.findFirst({where: {userId: user.id}, select: {id: true}});
		if (job) {
			const rows = await db.providerCost.groupBy({by: ['provider'], where: {jobId: job.id}, _sum: {usdMicros: true}});
			run.costByProvider = Object.fromEntries(rows.map((r) => [r.provider, r._sum.usdMicros ?? 0]));
			run.usdMicros = rows.reduce((sum, r) => sum + (r._sum.usdMicros ?? 0), 0);
		}
		run.seconds = (Date.now() - started) / 1000;
		await db.user.delete({where: {id: user.id}}).catch(() => undefined);
		await storage.deletePrefix(`u/${user.id}/`).catch(() => undefined);
	}
	runs.push(run);
	console.error(
		`${run.ok ? 'ok    ' : 'FAILED'} ${site} (${run.seconds.toFixed(0)} s, $${(run.usdMicros / 1e6).toFixed(3)})${run.error ? `: ${run.error}` : ''}${run.kept ? `\n       saved ${run.kept}` : ''}`,
	);
}

const models = providers.models
	? Object.entries(providers.models)
			.map(([r, m]) => `${r}=${m}`)
			.join(', ')
	: 'mock';
const markdown = report(runs, {
	Date: new Date().toISOString(),
	Providers: real ? 'real' : 'mock',
	Models: real ? `${models} (via ${config.LLM_PROVIDER})` : models,
	Voice: real ? `${config.TTS_PROVIDER} ${config.TTS_MODEL ?? ''}`.trim() : 'mock',
	Scraper: values.scraper ?? 'real',
	Render: rendering ? 'local (QA and motion measured)' : 'fake (QA and motion not measured)',
	Length: `${durationSec} s${values.voiceover ? ' with voiceover' : ''}`,
	Prompts: PROMPT_VERSION,
});
const outDir = fileURLToPath(new URL('../../../../out/evals/', import.meta.url));
mkdirSync(outDir, {recursive: true});
const file = `${outDir}${new Date().toISOString().replaceAll(':', '-')}.md`;
writeFileSync(file, markdown);
process.stdout.write(`${markdown}\n`);
console.error(`report saved to ${file}`);
await db.$disconnect();
