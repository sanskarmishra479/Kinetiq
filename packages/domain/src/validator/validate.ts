import {parse} from '@babel/parser';
import traverseModule, {type NodePath} from '@babel/traverse';
import type * as t from '@babel/types';
import {
	ALLOWED_ELEMENTS,
	ALLOWED_GLOBALS,
	ALLOWED_IMPORTS,
	BANNED_ATTRIBUTES,
	BANNED_PROPERTIES,
	isInternalName,
	MAX_SCENE_BYTES,
	REACT_DEFAULT_MEMBERS,
	RESERVED_BINDINGS,
	type AllowedModule,
} from './allowlist.js';

// AST allowlist validator for LLM-written scene code (FR-GEN-06, NFR-SEC-06, NFR-SEC-13).
// The code is parsed, never run. Rules:
// - imports: only allowlisted names from react, remotion and @kinetiq/primitives
// - globals: only allowlisted ones, used in allowlisted ways (never aliased)
// - no dynamic property access (obj[x]), no prototype/internal property names
// - no escape syntax: import(), tagged templates, with, this, classes, async, generators
// - JSX: only allowlisted elements; no ref, event handlers, innerHTML, links
// - exactly one `export default`, the scene component
// Errors are written for the scene-coder LLM, which gets them back to fix its code.

export type ValidationError = {message: string; line: number; column: number};
export type ValidationResult = {ok: true} | {ok: false; errors: ValidationError[]};

// @babel/traverse is CommonJS; its default export arrives nested under some loaders.
const traverse = ((traverseModule as unknown as {default?: typeof traverseModule}).default ??
	traverseModule) as typeof traverseModule;

const MAX_ERRORS = 20;

/** Components used as <Object.Member>. */
const JSX_MEMBERS: Record<string, readonly string[]> = {Series: ['Sequence']};

/** Node types that are never allowed, with the reason given to the LLM. */
const BANNED_SYNTAX: Partial<Record<t.Node['type'], string>> = {
	ImportExpression: 'dynamic import() is not allowed',
	TaggedTemplateExpression: 'tagged templates are not allowed',
	WithStatement: '`with` is not allowed',
	ThisExpression: '`this` is not allowed; use function components and props',
	MetaProperty: '`import.meta` / `new.target` are not allowed',
	ClassDeclaration: 'classes are not allowed; use function components',
	ClassExpression: 'classes are not allowed; use function components',
	AwaitExpression: 'async code is not allowed; scenes render synchronously per frame',
	YieldExpression: 'generators are not allowed',
	DebuggerStatement: '`debugger` is not allowed',
	ExportAllDeclaration: 're-exports are not allowed',
	ExportNamedDeclaration: 'only `export default` is allowed',
	TSImportEqualsDeclaration: '`import x = require()` is not allowed',
	TSExportAssignment: '`export =` is not allowed',
	TSModuleDeclaration: 'namespaces and `declare` blocks are not allowed',
	JSXNamespacedName: 'namespaced JSX names are not allowed',
};

/** Type-only subtrees: skipped, they vanish when the code is compiled. */
const TYPE_ONLY = new Set([
	'TSTypeAnnotation',
	'TSTypeParameterDeclaration',
	'TSTypeParameterInstantiation',
	'TSTypeAliasDeclaration',
	'TSInterfaceDeclaration',
	'TSDeclareFunction',
]);

export function validateScene(source: string): ValidationResult {
	if (new TextEncoder().encode(source).length > MAX_SCENE_BYTES) {
		return fail({message: `scene code must be under ${MAX_SCENE_BYTES / 1024} KB`, line: 1, column: 0});
	}

	let ast: t.File;
	try {
		ast = parse(source, {sourceType: 'module', plugins: ['jsx', 'typescript'], errorRecovery: false});
	} catch (error) {
		// Babel's parse errors always carry a message and a position.
		const e = error as {message: string; loc: {line: number; column: number}};
		return fail({message: `syntax error: ${e.message}`, line: e.loc.line, column: e.loc.column});
	}

	const errors: ValidationError[] = [];
	const report = (node: t.Node, message: string) => {
		if (errors.length < MAX_ERRORS) {
			// Every node from the parser has a location.
			const {line, column} = node.loc!.start;
			errors.push({message, line, column});
		}
	};
	/** Local names bound to the default import of react (`import React from 'react'`). */
	const reactDefaults = new Set<string>();
	let defaultExports = 0;

	traverse(ast, {
		enter(path) {
			const {node} = path;
			if (TYPE_ONLY.has(node.type) || (path.isTSType() && !path.parentPath?.isTSType())) {
				path.skip();
				return;
			}
			const banned = BANNED_SYNTAX[node.type];
			if (banned) report(node, banned);
		},

		ImportDeclaration(path) {
			const {node} = path;
			const source = node.source.value;
			if (!Object.hasOwn(ALLOWED_IMPORTS, source)) {
				report(node, `import from "${source}" is not allowed; use react, remotion or @kinetiq/primitives`);
				return;
			}
			const allowed: readonly string[] = ALLOWED_IMPORTS[source as AllowedModule];
			if (node.importKind === 'type') return;
			for (const spec of node.specifiers) {
				if (spec.type === 'ImportNamespaceSpecifier') {
					report(spec, `\`import * as\` is not allowed; import names from "${source}" directly`);
				} else if (spec.type === 'ImportDefaultSpecifier') {
					if (source === 'react') reactDefaults.add(spec.local.name);
					else report(spec, `"${source}" has no default export; use named imports`);
				} else if (spec.importKind !== 'type') {
					const name = spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value;
					if (!allowed.includes(name)) report(spec, `"${name}" is not available from "${source}"`);
				}
			}
		},

		ExportDefaultDeclaration() {
			defaultExports++;
		},

		Function(path) {
			const {node} = path;
			if (node.async) report(node, 'async functions are not allowed');
			if (node.generator) report(node, 'generators are not allowed');
		},

		// Top-level names must not collide with the compiled module wrapper (require, exports, _helpers).
		Program: {
			exit(path) {
				for (const [name, binding] of Object.entries(path.scope.bindings)) {
					if (RESERVED_BINDINGS.has(name) || /^_[A-Za-z]/.test(name)) {
						report(binding.identifier, `the name "${name}" is reserved; pick another name`);
					}
				}
			},
		},

		/** Lowercase tags are HTML/SVG elements, not references: check them against the allowlist. */
		JSXOpeningElement(path) {
			const {name} = path.node;
			if (name.type === 'JSXIdentifier' && !/^[A-Z]/.test(name.name) && !ALLOWED_ELEMENTS.has(name.name)) {
				report(name, `<${name.name}> is not allowed in scenes`);
			}
		},

		ReferencedIdentifier(path: NodePath<t.Identifier | t.JSXIdentifier>) {
			const name = path.node.name;
			const binding = path.scope.getBinding(name);
			if (binding) {
				if (reactDefaults.has(name) && binding.kind === 'module') checkReactUse(path, name, report);
				return;
			}
			checkGlobal(path, name, report);
		},

		'MemberExpression|OptionalMemberExpression'(path: NodePath<t.MemberExpression | t.OptionalMemberExpression>) {
			const {node} = path;
			if (node.computed) {
				const key = node.property;
				if (key.type === 'NumericLiteral') return;
				if (key.type === 'StringLiteral') {
					checkPropertyName(key, key.value, report);
					return;
				}
				report(node, 'dynamic property access (obj[x]) is not allowed; use .at(i) for arrays or a literal key');
				return;
			}
			// Without classes, a non-computed property is always a plain identifier.
			checkPropertyName(node.property, (node.property as t.Identifier).name, report);
		},

		'ObjectProperty|ObjectMethod'(path: NodePath<t.ObjectProperty | t.ObjectMethod>) {
			const {node} = path;
			// Keys must be written out, so banned keys can't be assembled at runtime.
			if (node.computed && node.key.type !== 'StringLiteral' && node.key.type !== 'NumericLiteral') {
				report(node, 'computed keys ({[x]: …}) are not allowed; write the key out');
				return;
			}
			const name = keyName(node.key);
			if (name !== null) checkPropertyName(node.key, name, report);
		},

		/** Only <Series.Sequence> (remotion's own API); other <X.Y> could reach internals. */
		JSXMemberExpression(path) {
			const {object, property} = path.node;
			const allowed =
				object.type === 'JSXIdentifier' && reactDefaults.has(object.name)
					? ['Fragment']
					: JSX_MEMBERS[object.type === 'JSXIdentifier' ? object.name : ''];
			const ok =
				object.type === 'JSXIdentifier' &&
				allowed?.includes(property.name) === true &&
				path.scope.getBinding(object.name)?.kind === 'module';
			if (!ok) {
				report(
					path.node,
					'use imported components directly, e.g. <Window>; only <Series.Sequence> and <React.Fragment> are allowed',
				);
			}
			path.skip();
		},

		JSXAttribute(path) {
			const {node} = path;
			if (node.name.type !== 'JSXIdentifier') return;
			const name = node.name.name;
			if (BANNED_ATTRIBUTES.has(name) || /^on[A-Z]/.test(name)) {
				report(node, `the "${name}" attribute is not allowed in scenes`);
			}
		},
	});

	if (defaultExports !== 1) {
		report(ast, 'the scene must have exactly one `export default` (the scene component)');
	}
	return errors.length === 0 ? {ok: true} : {ok: false, errors};
}

function fail(error: ValidationError): ValidationResult {
	return {ok: false, errors: [error]};
}

type Report = (node: t.Node, message: string) => void;

function keyName(key: t.Node): string | null {
	if (key.type === 'Identifier') return key.name;
	if (key.type === 'StringLiteral') return key.value;
	return null;
}

function checkPropertyName(node: t.Node, name: string, report: Report) {
	if (BANNED_PROPERTIES.has(name) || isInternalName(name)) {
		report(node, `the property "${name}" is not allowed`);
	}
}

/** `React` may only be used as `React.<allowed member>`. */
function checkReactUse(path: NodePath, name: string, report: Report) {
	const parent = path.parentPath;
	if (parent?.isMemberExpression() && parent.node.object === path.node && !parent.node.computed) {
		const prop = (parent.node.property as t.Identifier).name;
		if ((REACT_DEFAULT_MEMBERS as readonly string[]).includes(prop)) return;
		report(parent.node, `${name}.${prop} is not available in scenes`);
		return;
	}
	report(path.node, `use ${name} only as ${name}.useMemo / ${name}.Fragment / ${name}.useCallback`);
}

/** A name with no declaration in the code: must be an allowed global, used in an allowed way. */
function checkGlobal(path: NodePath, name: string, report: Report) {
	const rule = Object.hasOwn(ALLOWED_GLOBALS, name) ? ALLOWED_GLOBALS[name] : undefined;
	if (!rule) {
		report(path.node, `"${name}" is not available in scenes`);
		return;
	}
	const parent = path.parentPath;
	if (rule.value) return;
	if (rule.call && (parent?.isCallExpression() || parent?.isNewExpression()) && parent.node.callee === path.node) {
		return;
	}
	if (rule.members && parent?.isMemberExpression() && parent.node.object === path.node && !parent.node.computed) {
		const prop = (parent.node.property as t.Identifier).name;
		if (rule.members.includes(prop)) return;
		report(parent.node, `${name}.${prop} is not available in scenes`);
		return;
	}
	report(path.node, `"${name}" can't be used like this in scenes`);
}
