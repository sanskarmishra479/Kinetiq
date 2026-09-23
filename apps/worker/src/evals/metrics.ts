// Benchmark metrics for the generation pipeline (docs/TODO.md Phase 9).
// Pure: the runner collects one `EvalRun` per site, this turns them into the
// numbers used to compare models and tune limits.

export type EvalRun = {
	site: string;
	ok: boolean;
	error: string | null;
	seconds: number;
	/** Seconds spent in each pipeline step. */
	steps: Record<string, number>;
	scenes: number;
	/** Scene-writing calls, including rewrites after a validator rejection. */
	sceneWrites: number;
	/** Scenes sent back after visual QA. */
	sceneFixes: number;
	/** QA findings by kind (overflow, cut_off_text, static, …). */
	qaIssues: Record<string, number>;
	usdMicros: number;
	/** Cost per provider and model, in millionths of a dollar. */
	costByProvider: Record<string, number>;
	/** Where the finished video was saved (with --keep). */
	kept: string | null;
};

export type EvalSummary = {
	runs: number;
	succeeded: number;
	/** Share of scenes whose code passed the safety checks on the first try (target ≥ 95%). */
	allowlistFirstTry: number;
	/** Share of scenes that passed visual QA without a fix (target ≥ 85%). */
	qaFirstPass: number;
	/** Scenes flagged as frozen per 100 scenes (tunes MIN_MOTION_RATIO). */
	staticPer100: number;
	/** Overflow / cut-off text findings per 100 scenes. */
	overflowPer100: number;
	medianSeconds: number;
	/** Sets JOB_DEADLINE_MINUTES with headroom (FR-GEN-11). */
	p95Seconds: number;
	avgUsd: number;
	maxUsd: number;
	slowestStep: {step: string; avgSeconds: number} | null;
};

const ratio = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);

/** The value below which `p` of the sorted values fall (nearest rank). */
export function percentile(values: readonly number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
}

export function summarize(runs: readonly EvalRun[]): EvalSummary {
	const done = runs.filter((r) => r.ok);
	const scenes = done.reduce((sum, r) => sum + r.scenes, 0);
	const writes = done.reduce((sum, r) => sum + r.sceneWrites, 0);
	const fixes = done.reduce((sum, r) => sum + r.sceneFixes, 0);
	const issue = (kind: string) => done.reduce((sum, r) => sum + (r.qaIssues[kind] ?? 0), 0);
	const costs = runs.map((r) => r.usdMicros / 1_000_000);

	const stepTotals = new Map<string, number>();
	for (const run of done)
		for (const [step, s] of Object.entries(run.steps)) stepTotals.set(step, (stepTotals.get(step) ?? 0) + s);
	const slowest = [...stepTotals.entries()].sort((a, b) => b[1] - a[1])[0];

	return {
		runs: runs.length,
		succeeded: done.length,
		// Every write beyond one per scene is a rewrite (validator rejection or format repair).
		allowlistFirstTry: ratio(scenes - Math.max(0, writes - scenes - fixes), scenes),
		qaFirstPass: ratio(scenes - fixes, scenes),
		staticPer100: ratio(issue('static'), scenes) * 100,
		overflowPer100: ratio(issue('overflow') + issue('cut_off_text'), scenes) * 100,
		medianSeconds: percentile(
			done.map((r) => r.seconds),
			0.5,
		),
		p95Seconds: percentile(
			done.map((r) => r.seconds),
			0.95,
		),
		avgUsd: ratio(
			costs.reduce((a, b) => a + b, 0),
			runs.length,
		),
		maxUsd: costs.length ? Math.max(...costs) : 0,
		slowestStep: slowest ? {step: slowest[0], avgSeconds: slowest[1] / done.length} : null,
	};
}

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

/** A short markdown report, one line per site plus the summary against the targets. */
export function report(runs: readonly EvalRun[], meta: Record<string, string>): string {
	const s = summarize(runs);
	const lines = [
		`# Pipeline benchmark`,
		'',
		...Object.entries(meta).map(([k, v]) => `- **${k}:** ${v}`),
		'',
		'| Metric | Result | Target |',
		'|---|---|---|',
		`| Videos made | ${s.succeeded}/${s.runs} | all |`,
		`| Scene code passes the safety checks first try | ${pct(s.allowlistFirstTry)} | ≥ 95% |`,
		`| Scenes pass visual QA without a fix | ${pct(s.qaFirstPass)} | ≥ 85% |`,
		`| Frozen scenes per 100 | ${s.staticPer100.toFixed(1)} | low |`,
		`| Overflow / cut-off text per 100 scenes | ${s.overflowPer100.toFixed(1)} | low |`,
		`| Time per video (median / p95) | ${s.medianSeconds.toFixed(0)} s / ${s.p95Seconds.toFixed(0)} s | deadline with headroom |`,
		`| Cost per video (avg / max) | $${s.avgUsd.toFixed(3)} / $${s.maxUsd.toFixed(3)} | below the credit price |`,
		`| Slowest step | ${s.slowestStep ? `${s.slowestStep.step} (${s.slowestStep.avgSeconds.toFixed(0)} s avg)` : '-'} | |`,
		'',
		'## Cost per provider (all videos)',
		'',
		'| Provider / model | Cost |',
		'|---|---|',
		...costRows(runs),
		'',
		'| Site | Result | Time | Scenes | Rewrites | Fixes | Cost |',
		'|---|---|---|---|---|---|---|',
		...runs.map(
			(r) =>
				`| ${r.site} | ${r.ok ? 'ok' : `failed: ${r.error ?? 'unknown'}`} | ${r.seconds.toFixed(0)} s | ${r.scenes} | ${Math.max(0, r.sceneWrites - r.scenes - r.sceneFixes)} | ${r.sceneFixes} | $${(r.usdMicros / 1_000_000).toFixed(3)} |`,
		),
		'',
	];
	return lines.join('\n');
}

/** Total cost per provider across runs, most expensive first. */
function costRows(runs: readonly EvalRun[]): string[] {
	const totals = new Map<string, number>();
	for (const run of runs)
		for (const [p, micros] of Object.entries(run.costByProvider)) totals.set(p, (totals.get(p) ?? 0) + micros);
	return [...totals.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([p, micros]) => `| ${p} | $${(micros / 1_000_000).toFixed(4)} |`);
}
