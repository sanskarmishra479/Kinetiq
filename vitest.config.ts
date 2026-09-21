import {defineConfig} from 'vitest/config';

// Two projects: fast unit tests (every commit) and integration tests that need
// real Postgres/Redis (every PR). See docs/TEST_PLAN.md §3.
export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: 'unit',
					include: ['{apps,packages,tooling}/**/*.test.ts'],
					exclude: ['**/*.int.test.ts', '**/node_modules/**'],
				},
			},
			{
				test: {
					name: 'int',
					include: ['{apps,packages,tooling}/**/*.int.test.ts'],
					exclude: ['**/node_modules/**'],
					testTimeout: 60_000,
					hookTimeout: 120_000,
				},
			},
		],
		coverage: {
			provider: 'v8',
			include: ['{apps,packages}/*/src/**/*.ts'],
			exclude: ['**/*.test.ts', '**/index.ts'],
			// Gates from docs/TEST_PLAN.md §5. Money and sandbox logic must be fully covered.
			thresholds: {
				'packages/domain/src/credits/**': {branches: 100, functions: 100, lines: 100, statements: 100},
				'packages/domain/src/validator/**': {branches: 100, functions: 100, lines: 100, statements: 100},
				'packages/domain/src/**': {branches: 85, functions: 85, lines: 85, statements: 85},
				'packages/shared/src/**': {branches: 90, functions: 90, lines: 90, statements: 90},
				'apps/*/src/**': {branches: 70, functions: 70, lines: 70, statements: 70},
			},
		},
	},
});
