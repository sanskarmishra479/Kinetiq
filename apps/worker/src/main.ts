import {assertRedisNoEviction} from '@kinetiq/platform';
import {ConfigError, loadConfig} from '@kinetiq/shared';
import {buildWorkerContainer} from './container.js';
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
