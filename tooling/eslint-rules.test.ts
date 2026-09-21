import {ESLint} from 'eslint';
import {describe, expect, it} from 'vitest';

// Proves testability rule T3 is enforced: domain code can't read the real
// clock or global randomness. Other packages are unaffected.
const eslint = new ESLint({cwd: process.cwd()});

async function ruleIds(code: string, filePath: string) {
	const [result] = await eslint.lintText(code, {filePath});
	return (result?.messages ?? []).map((m) => m.ruleId);
}

describe('domain purity lint rules', () => {
	it('bans Date.now(), new Date() and Math.random() in packages/domain', async () => {
		const code = 'export const a = Date.now();\nexport const b = new Date();\nexport const c = Math.random();\n';
		const ids = await ruleIds(code, 'packages/domain/src/example.ts');
		expect(ids).toEqual(['no-restricted-properties', 'no-restricted-syntax', 'no-restricted-properties']);
	});

	it('still allows new Date(value) for parsing in packages/domain', async () => {
		expect(await ruleIds("export const d = new Date('2026-01-01');\n", 'packages/domain/src/example.ts')).toEqual([]);
	});

	it('allows them outside packages/domain', async () => {
		expect(await ruleIds('export const a = Date.now();\n', 'apps/api/src/example.ts')).toEqual([]);
	});
});
