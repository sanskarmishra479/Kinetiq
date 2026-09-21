import {loadConfig} from '@kinetiq/shared';
import {createDb} from '../src/client.js';
import {seed} from '../src/seed.js';

// `pnpm db:seed`. The local admin account is only created in local development.
const config = loadConfig();
const db = createDb(config.DATABASE_URL, 2);
await seed(db, config.APP_ENV === 'local' ? {localAdminEmail: 'admin@kinetiq.local'} : {});
await db.$disconnect();
console.warn(`Seeded (${config.APP_ENV}).`);
