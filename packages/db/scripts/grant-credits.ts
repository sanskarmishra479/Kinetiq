import {randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
import {loadConfig} from '@kinetiq/shared';
import {createDb} from '../src/client.js';
import {creditsService} from '../src/credits.js';
import {createIdGenerator} from '../src/ids.js';

// Local development only: gives a user free test credits.
//   pnpm credits:grant --email you@example.com --amount 100
// Refuses to run anywhere but APP_ENV=local, so it can never mint real credits.

const config = loadConfig();
if (config.APP_ENV !== 'local') {
	console.error('Refusing: credits:grant only runs with APP_ENV=local.');
	process.exit(1);
}
const {values} = parseArgs({options: {email: {type: 'string'}, amount: {type: 'string'}}});
const amount = Number(values.amount);
if (!values.email || !Number.isInteger(amount) || amount <= 0) {
	console.error('Usage: pnpm credits:grant --email you@example.com --amount 100');
	process.exit(1);
}

const db = createDb(config.DATABASE_URL, 2);
const user = await db.user.findUnique({where: {email: values.email}});
if (!user) {
	console.error(`No user with email ${values.email}. Log in once first.`);
	process.exit(1);
}
const credits = creditsService({db, ids: createIdGenerator(), clock: {now: () => Date.now()}});
await credits.grant(user.id, {amount, source: 'grant', key: `dev-grant:${randomUUID()}`});
console.warn(
	`Granted ${amount} test credits to ${values.email}. Balance: ${(await credits.balance(user.id)).available}`,
);
await db.$disconnect();
