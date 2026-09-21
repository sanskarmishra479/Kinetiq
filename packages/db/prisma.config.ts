import {defineConfig} from 'prisma/config';

// Prisma CLI config. DATABASE_DIRECT_URL (unpooled) is preferred for migrations;
// the app itself connects with DATABASE_URL (pooled in production).
// Environment variables come from the shell or the root .env (loaded by the scripts).
export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations',
		seed: 'tsx prisma/seed.ts',
	},
	datasource: {
		url: process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'] ?? '',
	},
});
