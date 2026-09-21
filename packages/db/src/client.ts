import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from './generated/prisma/client.js';

export type Db = PrismaClient;

/**
 * Creates a Prisma client on the pg driver adapter.
 * Use the pooled connection string in production (Neon) and keep `maxConnections`
 * small per replica (NFR-SCALE-02).
 */
export function createDb(connectionString: string, maxConnections = 10): Db {
	return new PrismaClient({adapter: new PrismaPg({connectionString, max: maxConnections})});
}
