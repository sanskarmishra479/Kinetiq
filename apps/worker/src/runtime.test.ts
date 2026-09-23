import {describe, expect, it} from 'vitest';
import {generateConcurrency} from './runtime.js';

describe('generateConcurrency', () => {
	it('makes one video at a time when rendering on this machine', () => {
		expect(generateConcurrency({RENDER_MODE: 'local', WORKER_CONCURRENCY: 20})).toBe(1);
		expect(generateConcurrency({RENDER_MODE: 'lambda', WORKER_CONCURRENCY: 20})).toBe(20);
	});
});
