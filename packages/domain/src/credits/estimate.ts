import {CREDIT_COSTS, FREE_EDITS_PER_VERSION, type CreditItem} from '@kinetiq/shared';

// What a video will cost, in credits (FR-GEN-01). The API uses this for the
// estimate and for the reservation, so the two can never disagree.

export type EstimateInput = {
	durationSec: 15 | 30 | 45;
	voiceover: boolean;
	/** AI cinematic clips (post-MVP; 0 for now). */
	aiClips: number;
	/** Template discount on the video itself (0–90). */
	templateDiscountPct: number;
};

export type Estimate = {credits: number; breakdown: {item: CreditItem; credits: number}[]};

const VIDEO_ITEM = {15: 'video_15s', 30: 'video_30s', 45: 'video_45s'} as const;

export function estimate(input: EstimateInput, costs: Readonly<Record<CreditItem, number>> = CREDIT_COSTS): Estimate {
	const discount = Math.min(90, Math.max(0, Math.trunc(input.templateDiscountPct)));
	const videoItem = VIDEO_ITEM[input.durationSec];
	// Round the discounted price up so a discount never makes a video free.
	const breakdown: Estimate['breakdown'] = [
		{item: videoItem, credits: Math.max(1, Math.ceil((costs[videoItem] * (100 - discount)) / 100))},
	];
	if (input.voiceover) breakdown.push({item: 'voiceover', credits: costs.voiceover});
	const clips = Math.max(0, Math.trunc(input.aiClips));
	if (clips > 0) breakdown.push({item: 'ai_clip', credits: costs.ai_clip * clips});
	return {credits: breakdown.reduce((sum, b) => sum + b.credits, 0), breakdown};
}

/** Cost of the next chat edit on a version: the first few are free (FR-EDIT-05). */
export function editCost(freeEditsUsed: number, costs: Readonly<Record<CreditItem, number>> = CREDIT_COSTS): number {
	return freeEditsUsed < FREE_EDITS_PER_VERSION ? 0 : costs.edit;
}
