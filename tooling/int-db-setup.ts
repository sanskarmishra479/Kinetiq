import {execFileSync} from 'node:child_process';
import pg from 'pg';
import type {TestProject} from 'vitest/node';

// Integration-test database: dropped, recreated and migrated before every
// integration run, then handed to tests via inject('databaseUrl').
// Safety: only ever touches a database literally named "kinetiq_test" on a local host.
declare module 'vitest' {
	export interface ProvidedContext {
		databaseUrl: string;
	}
}

const TEST_DB = 'kinetiq_test';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export default async function setup(project: TestProject) {
	const base = new URL(process.env.DATABASE_URL ?? 'postgresql://kinetiq:kinetiq@localhost:5432/kinetiq');
	if (!LOCAL_HOSTS.has(base.hostname)) {
		throw new Error(`Refusing to create a test database on non-local host "${base.hostname}".`);
	}
	const admin = new URL(base);
	admin.pathname = '/postgres';
	const testUrl = new URL(base);
	testUrl.pathname = `/${TEST_DB}`;

	const client = new pg.Client({connectionString: admin.toString()});
	await client.connect();
	await client.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
	await client.query(`CREATE DATABASE ${TEST_DB}`);
	await client.end();

	execFileSync('pnpm', ['--filter', '@kinetiq/db', 'exec', 'prisma', 'migrate', 'deploy'], {
		env: {...process.env, DATABASE_URL: testUrl.toString(), DATABASE_DIRECT_URL: testUrl.toString()},
		stdio: 'pipe',
	});
	project.provide('databaseUrl', testUrl.toString());
}
