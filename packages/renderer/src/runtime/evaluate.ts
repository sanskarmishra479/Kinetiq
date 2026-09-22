import type {ComponentType} from 'react';
import {SCENE_MODULES} from './modules';

// Turns compiled scene code (from compileScene) into a React component.
// The code was validated before compiling; this adds a second fence: it runs
// in strict mode and require() only answers with the allowlisted modules.

export class SceneCodeError extends Error {
	constructor(
		readonly sceneId: string,
		message: string,
	) {
		super(`[scene:${sceneId}] ${message}`);
		this.name = 'SceneCodeError';
	}
}

export function evaluateScene(sceneId: string, code: string): ComponentType<Record<string, unknown>> {
	const require = (name: string) => {
		const mod = SCENE_MODULES[name];
		if (!mod) throw new SceneCodeError(sceneId, `module "${name}" is not available`);
		return mod;
	};
	const module = {exports: {} as Record<string, unknown>};
	try {
		const run = new Function('require', 'exports', 'module', `"use strict";\n${code}`);
		run(require, module.exports, module);
	} catch (error) {
		if (error instanceof SceneCodeError) throw error;
		throw new SceneCodeError(sceneId, `failed to load: ${(error as Error).message}`);
	}
	const component = module.exports.default;
	if (typeof component !== 'function') throw new SceneCodeError(sceneId, 'the default export is not a component');
	return component as ComponentType<Record<string, unknown>>;
}
