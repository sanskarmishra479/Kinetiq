// @kinetiq/shared: every contract (API, events, queues, LLM outputs), the
// product catalog and the typed config. Defined once, used everywhere
// (docs/TEST_PLAN.md rule T5).
export * from './common.js';
export * from './errors.js';
export * from './catalog.js';
export * from './api/projects.js';
export * from './api/messages.js';
export * from './api/jobs.js';
export * from './api/uploads.js';
export * from './api/account.js';
export * from './events.js';
export * from './queues.js';
export * from './llm.js';
export {CONFIG_KEYS, ConfigError, loadConfig, siteOf} from './config.js';
export type {Config} from './config.js';
