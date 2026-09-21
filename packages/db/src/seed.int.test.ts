import {beforeEach, describe, expect, it} from 'vitest';
import {seed, DEFAULT_FLAGS} from './seed.js';
import {resetDb, testDb} from './testing/index.js';

const db = testDb();

beforeEach(async () => {
	await resetDb(db);
});

describe('seed', () => {
	it('creates default flags, the unpublished demo template and the local admin', async () => {
		await seed(db, {localAdminEmail: 'admin@kinetiq.local'});
		const flags = await db.featureFlag.findMany();
		expect(Object.fromEntries(flags.map((f) => [f.key, f.value]))).toEqual(DEFAULT_FLAGS);
		const template = await db.template.findUnique({where: {slug: 'desktop-story'}, include: {slots: true}});
		expect(template?.published).toBe(false);
		expect(template?.slots).toHaveLength(5);
		expect((await db.user.findUnique({where: {email: 'admin@kinetiq.local'}}))?.role).toBe('admin');
	});

	it('is idempotent and never overwrites changed flags', async () => {
		await seed(db);
		await db.featureFlag.update({where: {key: 'pause_new_jobs'}, data: {value: true}});
		await seed(db);
		expect((await db.featureFlag.findUnique({where: {key: 'pause_new_jobs'}}))?.value).toBe(true);
		expect(await db.template.count()).toBe(1);
		expect(await db.user.count()).toBe(0);
	});
});
