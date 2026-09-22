import {ALLOWED_IMPORTS} from '@kinetiq/domain/allowlist';
import * as Primitives from '@kinetiq/primitives';
import {Fragment, useCallback, useMemo} from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import * as Remotion from 'remotion';

// The only modules compiled scene code can require(), holding exactly the
// names the validator allows (docs/ARCHITECTURE.md §6). A name missing here
// but allowed by the validator is caught by a test.

function pick<T extends object>(source: T, names: readonly string[]): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const name of names) out[name] = (source as Record<string, unknown>)[name];
	return Object.freeze(out);
}

const react = {Fragment, useMemo, useCallback};

export const SCENE_MODULES: Readonly<Record<string, Readonly<Record<string, unknown>>>> = Object.freeze({
	// `import React from 'react'` reads .default; named imports read the fields.
	react: Object.freeze({__esModule: true, default: Object.freeze({...react}), ...react}),
	'react/jsx-runtime': pick(JsxRuntime, ['jsx', 'jsxs', 'Fragment']),
	remotion: pick(Remotion, ALLOWED_IMPORTS.remotion),
	'@kinetiq/primitives': pick(Primitives, ALLOWED_IMPORTS['@kinetiq/primitives']),
});
