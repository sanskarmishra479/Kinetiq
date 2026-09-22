import {ConfigError, loadConfig} from '@kinetiq/shared';
import {buildApp} from './app.js';
import {buildContainer} from './container.js';

// API entry point: validate config (refuse to boot if unsafe), wire the
// container, listen, and shut down gracefully on SIGTERM (zero-downtime deploys).

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

const container = buildContainer(config);
const server = buildApp(container).listen(config.PORT, () => {
	container.logger.info({port: config.PORT, env: config.APP_ENV}, 'api listening');
});

async function shutdown(signal: string) {
	container.logger.info({signal}, 'shutting down');
	server.close(() => {
		void container.close().then(() => process.exit(0));
	});
	setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
