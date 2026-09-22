// @kinetiq/db: Prisma client, id generator and repositories.
// Repositories are the only code that touches the database (docs/ARCHITECTURE.md §8).
import {assetsRepo} from './repos/assets.js';
import {jobsRepo, versionsRepo} from './repos/jobs.js';
import {brandKitsRepo, messagesRepo, projectsRepo} from './repos/projects.js';
import type {RepoDeps} from './repos/shared.js';
import {accountsRepo, featureFlagsRepo, idempotencyRepo, webhookEventsRepo} from './repos/system.js';
import {templatesRepo} from './repos/templates.js';

export {createDb, type Db} from './client.js';
export {createIdGenerator} from './ids.js';
export {DEFAULT_FLAGS, seed} from './seed.js';
export {storageKeyFor} from './repos/assets.js';
export {isUniqueViolation, type RepoDeps} from './repos/shared.js';

export function createRepos(deps: RepoDeps) {
	return {
		projects: projectsRepo(deps),
		messages: messagesRepo(deps),
		brandKits: brandKitsRepo(deps),
		assets: assetsRepo(deps),
		jobs: jobsRepo(deps),
		versions: versionsRepo(deps),
		accounts: accountsRepo(deps),
		idempotency: idempotencyRepo(deps),
		webhookEvents: webhookEventsRepo(deps),
		featureFlags: featureFlagsRepo(deps),
		templates: templatesRepo(deps),
	};
}
export type Repos = ReturnType<typeof createRepos>;
