import {toNodeHandler} from 'better-auth/node';
import express, {type Express} from 'express';
import type {Container} from './container.js';
import {errorHandler, notFoundHandler} from './errors.js';
import {httpLogger} from './middleware/logging.js';
import {byIp, byUser, rateLimit, RULES} from './middleware/rate-limit.js';
import {corsFor, originCheck, securityHeaders} from './middleware/security.js';
import {loadSession} from './middleware/session.js';
import {accountRoutes, billingRoutes, healthRoutes} from './routes/account.js';
import {catalogRoutes} from './routes/catalog.js';
import {projectRoutes} from './routes/projects.js';
import {uploadRoutes} from './routes/uploads.js';

// The Express app. Order matters:
//  1. logging, security headers, CORS
//  2. health checks (cheap, unauthenticated)
//  3. BetterAuth, which reads the raw body itself, so it goes before express.json()
//  4. JSON body parsing (1 MB max), Origin check, session, rate limits
//  5. routes, 404, error handler
export function buildApp(container: Container): Express {
	const {config, logger, auth, rateLimiter} = container;
	const app = express();
	app.set('trust proxy', config.TRUST_PROXY);
	app.disable('x-powered-by');

	app.use(httpLogger(logger));
	app.use(securityHeaders(config.APP_ENV !== 'local'));
	app.use(corsFor(config.WEB_ORIGIN));

	app.use(healthRoutes(container));

	app.use('/api/auth', rateLimit(rateLimiter, RULES.authIp, byIp));
	app.all('/api/auth/*splat', toNodeHandler(auth));

	app.use(express.json({limit: '1mb'}));
	app.use(
		'/v1',
		originCheck(config.WEB_ORIGIN),
		loadSession(auth),
		rateLimit(rateLimiter, RULES.apiIp, byIp),
		rateLimit(rateLimiter, RULES.apiUser, byUser),
	);
	app.use(
		'/v1',
		catalogRoutes(container),
		accountRoutes(container),
		billingRoutes(container),
		uploadRoutes(container),
		projectRoutes(container),
	);

	app.use(notFoundHandler);
	app.use(errorHandler);
	return app;
}
