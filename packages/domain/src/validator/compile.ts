import {transform} from 'sucrase';
import {validateScene, type ValidationError} from './validate.js';

// Validated TSX → plain JS for the renderer (docs/ARCHITECTURE.md §6).
// The output is a CommonJS module body: imports become require() calls,
// which the renderer answers with its allowlisted modules only, and the
// scene component is `exports.default`. Compiling never runs the code.

export type CompileResult = {ok: true; code: string} | {ok: false; errors: ValidationError[]};

export function compileScene(source: string): CompileResult {
	const valid = validateScene(source);
	if (!valid.ok) return valid;
	const {code} = transform(source, {
		transforms: ['typescript', 'jsx', 'imports'],
		jsxRuntime: 'automatic',
		production: true,
		disableESTransforms: true,
	});
	return {ok: true, code};
}
