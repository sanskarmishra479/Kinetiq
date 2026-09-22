import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {API_MD, generatePrimitivesApi} from './primitives-api';

describe('packages/primitives/API.md', () => {
	it('is up to date with the code (run `pnpm --filter @kinetiq/renderer docs:primitives`)', () => {
		expect(readFileSync(API_MD, 'utf8')).toBe(generatePrimitivesApi());
	}, 60_000);

	it('documents every allowed component with its props', () => {
		const md = generatePrimitivesApi();
		for (const name of ['Browser', 'Window', 'Cursor', 'Camera', 'BlurInText', 'KineticStack', 'Lens']) {
			expect(md).toContain(`### <${name}>`);
		}
		expect(md).toContain('### tween');
		expect(md).toContain('### Shot');
		expect(md).not.toContain('ThemeProvider');
	}, 60_000);
});
