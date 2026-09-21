import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {CONFIG_KEYS, loadConfig} from './config.js';

// Keeps /.env.example and the config schema in sync, and proves the
// documented local defaults actually boot.
const file = readFileSync(fileURLToPath(new URL('../../../.env.example', import.meta.url)), 'utf8');
const entries = Object.fromEntries(
	file
		.split('\n')
		.filter((line) => /^[A-Z0-9_]+=/.test(line))
		.map((line) => {
			const i = line.indexOf('=');
			return [line.slice(0, i), line.slice(i + 1)];
		}),
);

describe('.env.example', () => {
	it('documents exactly the variables the config schema reads', () => {
		expect(Object.keys(entries).sort()).toEqual([...CONFIG_KEYS].sort());
	});

	it('is a valid local config as-is', () => {
		expect(() => loadConfig(entries)).not.toThrow();
	});
});
