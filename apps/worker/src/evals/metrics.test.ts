import {describe, expect, it} from 'vitest';
import {percentile, report, summarize, type EvalRun} from './metrics.js';

const run = (overrides: Partial<EvalRun> = {}): EvalRun => ({
	site: 'https://acme.com',
	ok: true,
	error: null,
	seconds: 100,
	steps: {research: 10, sceneCoder: 60, finalRender: 30},
	scenes: 5,
	sceneWrites: 5,
	sceneFixes: 0,
	qaIssues: {},
	usdMicros: 120_000,
	...overrides,
});

describe('benchmark metrics', () => {
	it('computes the pass rates, timing and cost against the targets', () => {
		const summary = summarize([
			// One rewrite after a validator rejection, one QA fix, one frozen scene flagged.
			run({sceneWrites: 6, sceneFixes: 1, qaIssues: {static: 1, overflow: 1}, seconds: 120}),
			run({seconds: 80}),
			run({ok: false, error: 'model timed out', scenes: 0, sceneWrites: 2, seconds: 30, usdMicros: 20_000}),
		]);
		expect(summary).toMatchObject({
			runs: 3,
			succeeded: 2,
			staticPer100: 10,
			overflowPer100: 10,
			medianSeconds: 80,
			p95Seconds: 120,
			maxUsd: 0.12,
		});
		expect(summary.allowlistFirstTry).toBe(1); // 10 scenes, 11 writes, 1 of them a QA fix → no validator rewrites
		expect(summary.qaFirstPass).toBeCloseTo(0.9, 5);
		expect(summary.avgUsd).toBeCloseTo((0.12 + 0.12 + 0.02) / 3, 5);
		expect(summary.slowestStep).toEqual({step: 'sceneCoder', avgSeconds: 60});
	});

	it('counts extra scene writes as validator rewrites', () => {
		expect(summarize([run({sceneWrites: 7})]).allowlistFirstTry).toBeCloseTo(0.6, 5);
	});

	it('handles no runs, and nearest-rank percentiles', () => {
		expect(summarize([])).toMatchObject({
			runs: 0,
			succeeded: 0,
			allowlistFirstTry: 0,
			avgUsd: 0,
			maxUsd: 0,
			slowestStep: null,
		});
		expect(percentile([], 0.5)).toBe(0);
		expect(percentile([5, 1, 3], 0.5)).toBe(3);
		expect(percentile([5, 1, 3], 0.95)).toBe(5);
	});

	it('writes a readable report with every site', () => {
		const md = report([run(), run({site: 'https://b.com', ok: false, error: 'boom'})], {Models: 'x'});
		expect(md).toContain('- **Models:** x');
		expect(md).toContain('| Videos made | 1/2 | all |');
		expect(md).toContain('| https://b.com | failed: boom |');
	});
});
