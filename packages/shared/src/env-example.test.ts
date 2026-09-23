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

	// .env.example is committed and the repo is public: real keys belong in .env (git-ignored).
	it('never holds a real secret (NFR-SEC-14)', () => {
		// Local-only values for the Docker services, safe to publish.
		const localDevValues: Record<string, string> = {
			S3_ACCESS_KEY_ID: 'minio',
			S3_SECRET_ACCESS_KEY: 'minio-secret',
			BETTER_AUTH_SECRET: 'local-dev-secret-change-me-0123456789abcdef', // gitleaks:allow (public dev placeholder)
		};
		const secretLike = Object.entries(entries).filter(([key]) => /(KEY|SECRET|TOKEN|PASSWORD|DSN)/.test(key));
		expect(secretLike.length).toBeGreaterThan(5);
		for (const [key, value] of secretLike) {
			const expected = localDevValues[key] ?? '';
			// On failure, show only the key name, never the value.
			expect(
				value === expected,
				`${key} in .env.example must be ${expected ? `"${expected}"` : 'empty'}; put real keys in .env`,
			).toBe(true);
		}
	});

	it('keeps mocks on, so a fresh checkout costs nothing', () => {
		expect(entries.MOCK_PROVIDERS).toBe('true');
	});
});
