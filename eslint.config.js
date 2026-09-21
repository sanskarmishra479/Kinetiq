import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.turbo/**', 'primitives/**'],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			globals: {...globals.node},
		},
		rules: {
			'@typescript-eslint/consistent-type-imports': 'error',
			'@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
			'no-console': ['error', {allow: ['warn', 'error']}],
			eqeqeq: ['error', 'always'],
		},
	},
	// Testability rule T3 (docs/TEST_PLAN.md §2): domain logic gets time and
	// randomness from injected ports, never from globals.
	{
		files: ['packages/domain/**/*.ts'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: "NewExpression[callee.name='Date'][arguments.length=0]",
					message: 'Use ClockPort instead of new Date() in domain code (TEST_PLAN T3).',
				},
			],
			'no-restricted-properties': [
				'error',
				{
					object: 'Date',
					property: 'now',
					message: 'Use ClockPort instead of Date.now() in domain code (TEST_PLAN T3).',
				},
				{
					object: 'Math',
					property: 'random',
					message: 'Use an injected seeded RNG instead of Math.random() in domain code (TEST_PLAN T3).',
				},
			],
		},
	},
);
