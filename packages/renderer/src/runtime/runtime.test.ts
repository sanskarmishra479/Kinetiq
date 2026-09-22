import {compileScene} from '@kinetiq/domain';
import {ALLOWED_IMPORTS} from '@kinetiq/domain/allowlist';
import * as Primitives from '@kinetiq/primitives';
import * as Remotion from 'remotion';
import {describe, expect, it} from 'vitest';
import {VALID_SCENES} from '../../../domain/src/validator/fixtures/valid';
import {buildCsp} from './csp';
import {evaluateScene, SceneCodeError} from './evaluate';
import {SCENE_MODULES} from './modules';

describe('scene modules', () => {
	it('provide every name the validator allows, and nothing else', () => {
		for (const [mod, names] of Object.entries(ALLOWED_IMPORTS)) {
			const provided = SCENE_MODULES[mod]!;
			for (const name of names) expect(provided[name], `${mod}.${name}`).toBeDefined();
			const extra = Object.keys(provided).filter((k) => !(names as readonly string[]).includes(k));
			expect(extra.filter((k) => k !== 'default' && k !== '__esModule')).toEqual([]);
		}
		expect(SCENE_MODULES.remotion).not.toHaveProperty('Internals');
		expect(Object.isFrozen(SCENE_MODULES.remotion)).toBe(true);
	});

	it('the primitives allowlist matches what @kinetiq/primitives exports (no stale names)', () => {
		const exported = Object.keys(Primitives).filter(
			(k) => !['ThemeProvider', 'darkCinematic', 'minimalLight'].includes(k),
		);
		expect([...ALLOWED_IMPORTS['@kinetiq/primitives']].sort()).toEqual(exported.sort());
		expect(ALLOWED_IMPORTS.remotion.every((name) => name in Remotion)).toBe(true);
	});
});

describe('evaluateScene', () => {
	it('loads a compiled scene as a component', () => {
		for (const source of Object.values(VALID_SCENES)) {
			const compiled = compileScene(source);
			if (!compiled.ok) throw new Error('fixture must compile');
			expect(typeof evaluateScene('s1', compiled.code)).toBe('function');
		}
	});

	it('only answers require() with allowlisted modules', () => {
		expect(() => evaluateScene('s1', "require('fs'); exports.default = () => null;")).toThrow(
			new SceneCodeError('s1', 'module "fs" is not available'),
		);
	});

	it('runs in strict mode and names the scene in errors', () => {
		expect(() => evaluateScene('s2', 'undeclared = 1;')).toThrow(
			/\[scene:s2\] failed to load: undeclared is not defined/,
		);
		expect(() => evaluateScene('s3', 'exports.default = 42;')).toThrow(
			/\[scene:s3\] the default export is not a component/,
		);
	});
});

describe('buildCsp (NFR-SEC-12)', () => {
	it('blocks everything except the bundle, our asset origins and fonts', () => {
		const csp = buildCsp(['https://cdn.kinetiq.so', 'https://cdn.kinetiq.so']);
		expect(csp).toContain("default-src 'none'");
		expect(csp).toContain("script-src 'self' 'unsafe-eval'");
		expect(csp).toContain("connect-src 'self' http://localhost:* http://127.0.0.1:*");
		expect(csp).toContain("img-src 'self' data: blob: https://cdn.kinetiq.so http://localhost:*");
		expect(csp).toContain("frame-src 'none'");
		expect(csp.match(/cdn\.kinetiq\.so/g)).toHaveLength(3); // img, media, font; deduplicated
		expect(csp).not.toMatch(/connect-src[^;]*https:/);
	});
});
