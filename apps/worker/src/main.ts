import {assertRedisNoEviction} from '@kinetiq/platform';
import {ConfigError, loadConfig, providerVoice, VOICE_IDS} from '@kinetiq/shared';
import {checkModels, checkVoices} from './adapters/providers/openrouter.js';
import {buildWorkerContainer, modelsToCheck} from './container.js';
import {startWorkers} from './runtime.js';

// Worker entry point. Refuses to start if Redis could evict queue data
// (NFR-SCALE-06), and shuts down gracefully on SIGTERM (deploys) and SIGINT.

let config;
try {
	config = loadConfig();
} catch (error) {
	if (error instanceof ConfigError) {
		console.error(error.message);
		process.exit(1);
	}
	throw error;
}

const container = buildWorkerContainer(config);
const {logger} = container;

const policy = await assertRedisNoEviction(container.bullConnection!);
if (policy === 'unknown') logger.warn('could not read the Redis eviction policy; make sure it is "noeviction"');

// Real providers: make sure every configured model exists before taking jobs (NFR-MNT-05).
if (!config.MOCK_PROVIDERS) {
	const voiceMap = Object.fromEntries(
		VOICE_IDS.map((v) => [v, providerVoice(config.TTS_PROVIDER, v, config.TTS_VOICES)]),
	);
	const problems = [
		...(await checkModels(modelsToCheck(config)).catch((error: unknown) => [
			`could not check models: ${(error as Error).message}`,
		])),
		...(config.TTS_PROVIDER === 'openrouter' && config.TTS_MODEL
			? await checkVoices(config.TTS_MODEL, voiceMap).catch((error: unknown) => [
					`could not check voices: ${(error as Error).message}`,
				])
			: []),
	];
	if (problems.length > 0) {
		for (const problem of problems) logger.error(problem);
		process.exit(1);
	}
	logger.info({llm: config.LLM_PROVIDER, tts: config.TTS_PROVIDER}, 'providers ready');
}

const stop = await startWorkers(container);

let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
	process.on(signal, () => {
		if (stopping) return;
		stopping = true;
		logger.info({signal}, 'shutting down');
		const force = setTimeout(() => process.exit(1), 30_000);
		force.unref();
		void stop()
			.then(() => container.close())
			.then(() => process.exit(0));
	});
}
