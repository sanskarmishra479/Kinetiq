import type {Db} from './client.js';

// Baseline data. Idempotent: safe to run any number of times.
// Plans, packs, voices and presets are NOT seeded; they live in code
// (packages/shared/src/catalog.ts).

export const DEFAULT_FLAGS = {
	pause_new_jobs: false,
	pause_ai_clips: true, // AI clips are post-MVP
	force_fallback_model: false,
} as const;

const DESKTOP_STORY_SLOTS = [
	{key: 'productName', type: 'text', maxChars: 24},
	{key: 'headline', type: 'text', maxChars: 60},
	{key: 'notification', type: 'text', maxChars: 70},
	{key: 'logo', type: 'logo', maxChars: null},
	{key: 'productUi', type: 'ui', maxChars: null},
] as const;

export async function seed(db: Db, options: {localAdminEmail?: string} = {}) {
	for (const [key, value] of Object.entries(DEFAULT_FLAGS)) {
		// Never overwrite a flag an admin has changed.
		await db.featureFlag.upsert({where: {key}, create: {key, value}, update: {}});
	}

	// Template #1 (post-MVP): kept unpublished until the template pipeline exists.
	await db.template.upsert({
		where: {slug: 'desktop-story'},
		create: {
			id: 'tpl_desktopstory',
			slug: 'desktop-story',
			title: 'Desktop story',
			previewKey: 'templates/desktop-story/preview.mp4',
			posterKey: 'templates/desktop-story/poster.jpg',
			ratios: ['16:9'],
			durations: [15, 30],
			creditDiscountPct: 20,
			published: false,
			definition: {source: 'packages/primitives/src/ref/RefIntro.tsx'},
			slots: {
				create: DESKTOP_STORY_SLOTS.map((s) => ({
					id: `tsl_ds${s.key}`,
					key: s.key,
					type: s.type,
					maxChars: s.maxChars,
				})),
			},
		},
		update: {},
	});

	if (options.localAdminEmail) {
		await db.user.upsert({
			where: {email: options.localAdminEmail},
			create: {
				id: 'usr_localadmin',
				email: options.localAdminEmail,
				name: 'Local admin',
				emailVerified: true,
				role: 'admin',
			},
			update: {},
		});
	}
}
