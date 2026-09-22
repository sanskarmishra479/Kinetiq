// What LLM-written scene code may use (docs/ARCHITECTURE.md §6, NFR-SEC-06/13).
// Everything here is an ALLOWLIST: anything not listed is rejected.

/** Named imports allowed per module. The renderer provides exactly these at runtime. */
export const ALLOWED_IMPORTS = {
	react: ['Fragment', 'useMemo', 'useCallback'],
	remotion: [
		'AbsoluteFill',
		'Sequence',
		'Series',
		'Freeze',
		'Loop',
		'Img',
		'OffthreadVideo',
		'useCurrentFrame',
		'useVideoConfig',
		'interpolate',
		'interpolateColors',
		'spring',
		'measureSpring',
		'Easing',
		'random',
	],
	'@kinetiq/primitives': [
		'dur',
		'ease',
		'keyframes',
		'openClose',
		'springs',
		'tween',
		'useTheme',
		'isDark',
		'luminance',
		'Background',
		'BlurInText',
		'blurInEnd',
		'splitUnits',
		'FocusPull',
		'focusPull',
		'Browser',
		'browserChrome',
		'browserLayout',
		'browserTimeline',
		'chromeScale',
		'splitUrl',
		'Camera',
		'CaptionPills',
		'Captions',
		'ChatBubble',
		'TypingDots',
		'Cursor',
		'cursorAt',
		'isPressed',
		'Dock',
		'MenuBar',
		'Wallpaper',
		'KineticStack',
		'Lens',
		'LogoReveal',
		'Chip',
		'Dropdown',
		'MENU_PAD',
		'MENU_ROW',
		'menuRowY',
		'Notification',
		'Typewriter',
		'Window',
	],
} as const satisfies Record<string, readonly string[]>;

export type AllowedModule = keyof typeof ALLOWED_IMPORTS;

/** `React` (default import of "react") may only be used for these members. */
export const REACT_DEFAULT_MEMBERS = ['Fragment', 'useMemo', 'useCallback'] as const;

// prettier-ignore
const MATH = [
	'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atan2', 'atanh', 'cbrt', 'ceil', 'cos', 'cosh', 'exp', 'expm1',
	'floor', 'fround', 'hypot', 'log', 'log10', 'log1p', 'log2', 'max', 'min', 'pow', 'round', 'sign', 'sin', 'sinh',
	'sqrt', 'tan', 'tanh', 'trunc', 'E', 'LN10', 'LN2', 'LOG10E', 'LOG2E', 'PI', 'SQRT1_2', 'SQRT2',
	// Not Math.random: renders must be deterministic; use remotion's random(seed).
];

/**
 * Browser/JS globals scene code may use, and how:
 * - `call`: may be called or constructed directly, e.g. `Number(x)`, `new Map()`
 * - `members`: may be read only as `Global.member` with one of these names
 * - `value`: may be used as a plain value
 * A global can never be aliased (`const O = Object`), so these checks can't be bypassed.
 */
export const ALLOWED_GLOBALS: Record<string, {call?: boolean; members?: readonly string[]; value?: boolean}> = {
	Math: {members: MATH},
	Number: {
		call: true,
		members: [
			'isFinite',
			'isInteger',
			'isNaN',
			'parseFloat',
			'parseInt',
			'EPSILON',
			'MAX_SAFE_INTEGER',
			'MIN_SAFE_INTEGER',
		],
	},
	String: {call: true},
	Boolean: {call: true},
	Array: {call: true, members: ['isArray', 'from', 'of']},
	// No Object.fromEntries: it builds objects with computed keys (e.g. dangerouslySetInnerHTML).
	Object: {members: ['keys', 'values', 'entries', 'assign', 'freeze']},
	JSON: {members: ['stringify']},
	Map: {call: true},
	Set: {call: true},
	parseInt: {call: true},
	parseFloat: {call: true},
	isNaN: {call: true},
	isFinite: {call: true},
	undefined: {value: true},
	NaN: {value: true},
	Infinity: {value: true},
};

/** Property names that lead out of the sandbox (prototype chain, React internals, DOM). */
export const BANNED_PROPERTIES = new Set([
	'constructor',
	'prototype',
	'caller',
	'callee',
	'arguments',
	'ownerDocument',
	'defaultView',
	'contentWindow',
	'contentDocument',
	'stateNode',
	'dangerouslySetInnerHTML',
	'srcDoc',
	'srcdoc',
]);

/** Names starting like this are internals (`__proto__`, `_owner`, `$$typeof`). */
export const isInternalName = (name: string) => name.startsWith('_') || name.startsWith('$');

/** HTML/SVG elements scene code may render. No script, iframe, img, link, style, form, a, object… */
// prettier-ignore
export const ALLOWED_ELEMENTS = new Set([
	'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'b', 'i', 'u', 's', 'small', 'br', 'hr',
	'ul', 'ol', 'li', 'section', 'header', 'footer', 'main', 'article', 'aside', 'nav', 'figure', 'figcaption',
	'blockquote', 'code', 'pre', 'kbd', 'mark', 'sup', 'sub', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
	'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs',
	'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern', 'symbol', 'filter',
	'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix', 'feMerge', 'feMergeNode', 'feFlood', 'feComposite',
	'feDropShadow', 'feTurbulence', 'feDisplacementMap',
]);

/** JSX attributes that are never allowed (event handlers are checked separately). */
export const BANNED_ATTRIBUTES = new Set([
	'ref',
	'dangerouslySetInnerHTML',
	'srcDoc',
	'srcdoc',
	'href',
	'xlinkHref',
	'action',
	'formAction',
	'is',
]);

/** Binding names scene code may not declare (they would collide with the compiled module wrapper). */
export const RESERVED_BINDINGS = new Set(['require', 'exports', 'module']);

export const MAX_SCENE_BYTES = 30 * 1024;
