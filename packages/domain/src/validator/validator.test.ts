import {describe, expect, it} from 'vitest';
import {ALLOWED_IMPORTS} from './allowlist.js';
import {compileScene} from './compile.js';
import {MALICIOUS} from './fixtures/malicious.js';
import {VALID_SCENES} from './fixtures/valid.js';
import {validateScene} from './validate.js';

// FR-GEN-06, NFR-SEC-06, NFR-SEC-13: every attack is rejected, real scenes pass.

describe('validateScene: malicious corpus (100% must be rejected)', () => {
	it.each(MALICIOUS)('rejects $name', ({code, expect: message}) => {
		const result = validateScene(code);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors.map((e) => e.message).join('\n')).toMatch(message);
	});
});

describe('validateScene: valid scenes', () => {
	it.each(Object.entries(VALID_SCENES))('accepts %s', (_name, code) => {
		expect(validateScene(code)).toEqual({ok: true});
	});

	it('accepts type-only imports of anything from allowed modules', () => {
		const code =
			"import type {Theme} from '@kinetiq/primitives';\nimport {type FC} from 'react';\nconst S: FC<{t: Theme}> = () => null;\nexport default S;";
		expect(validateScene(code)).toEqual({ok: true});
	});

	it('accepts plain values, string import names and <React.Fragment>', () => {
		const code =
			"import React from 'react';\nimport {'AbsoluteFill' as Fill} from 'remotion';\nexport default () => <React.Fragment><Fill>{String(undefined ?? NaN ?? Infinity)}</Fill></React.Fragment>;";
		expect(validateScene(code)).toEqual({ok: true});
	});

	it('accepts literal computed keys that are safe', () => {
		const code = "const o = {['a']: 1, [2]: 2};\nexport default () => <div>{o['a'] + o[2]}</div>;";
		expect(validateScene(code)).toEqual({ok: true});
	});
});

describe('error reporting for the fix loop', () => {
	it('points at the line and column of each problem', () => {
		const result = validateScene("export default function S() {\n\treturn fetch('x');\n}");
		expect(result).toEqual({ok: false, errors: [{message: '"fetch" is not available in scenes', line: 2, column: 8}]});
	});

	it('reports at most 20 errors', () => {
		const code = `export default function S() {\n${'fetch(1);\n'.repeat(30)}}`;
		const result = validateScene(code);
		expect(!result.ok && result.errors.length).toBe(20);
	});

	it('reports syntax errors with their position', () => {
		const result = validateScene('const = 1;');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors[0]).toMatchObject({line: 1, message: expect.stringMatching(/syntax error/)});
	});
});

describe('compileScene', () => {
	it('turns a valid scene into a CommonJS module body without types or JSX', () => {
		const result = compileScene(VALID_SCENES.title!);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.code).toContain("require('remotion')");
		expect(result.code).toContain('require("react/jsx-runtime")');
		expect(result.code).toContain('exports.default');
		expect(result.code).not.toMatch(/<h1|: Props/);
	});

	it('never compiles code that fails validation', () => {
		expect(compileScene("export default () => fetch('x');")).toMatchObject({ok: false});
	});
});

describe('allowlist', () => {
	it('has no duplicates', () => {
		for (const names of Object.values(ALLOWED_IMPORTS)) expect(new Set(names).size).toBe(names.length);
	});
});
