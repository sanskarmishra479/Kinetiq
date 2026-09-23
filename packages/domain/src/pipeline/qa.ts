import type {QaReport} from '@kinetiq/shared';

// What to do about the problems visual QA found (FR-GEN-07, NFR-COST-04).
// Pure, so the rules are easy to test and cheap to change.

/** The MVP allows one fix round; each round costs another model call and render. */
export const MAX_FIX_ROUNDS = 1;

export type SceneVerdict = 'ok' | 'fix' | 'fallback' | 'accept';

export type SceneQaInput = {
	report: QaReport;
	/** Fix rounds already spent on this scene. */
	fixes: number;
	/** The scene shows the product UI and we have a screenshot to fall back to. */
	canFallBackToScreenshot: boolean;
};

/** Low-severity nits are not worth another model call. */
export const worthFixing = (report: QaReport) => !report.pass && report.issues.some((i) => i.severity !== 'low');

/**
 * - `ok`: nothing to do.
 * - `fix`: ask the model to repair the scene.
 * - `fallback`: rebuilding the UI keeps failing, so show the real screenshot instead.
 * - `accept`: out of rounds; ship the scene as it is rather than failing the whole video.
 */
export function verdictFor(
	{report, fixes, canFallBackToScreenshot}: SceneQaInput,
	maxRounds = MAX_FIX_ROUNDS,
): SceneVerdict {
	if (!worthFixing(report)) return 'ok';
	if (fixes < maxRounds) return 'fix';
	return canFallBackToScreenshot ? 'fallback' : 'accept';
}

/** The issues to hand back to the model, worst first, as short lines. */
export function fixNotes(report: QaReport, max = 6): string[] {
	const rank = {high: 0, medium: 1, low: 2};
	return [...report.issues]
		.sort((a, b) => rank[a.severity] - rank[b.severity])
		.slice(0, max)
		.map((i) => `${i.kind} (${i.severity}) at frame ${i.frame}: ${i.description}`);
}
