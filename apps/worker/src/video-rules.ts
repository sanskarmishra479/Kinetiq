import type {ProbeFacts} from './ports.js';

// Which uploaded videos we accept (FR-PRJ-04). Pure, so every rule is unit-tested.

export const VIDEO_RULES = {
	maxDurationSec: 120,
	maxSide: 4096,
	codecs: ['h264', 'hevc', 'vp8', 'vp9', 'av1'],
} as const;

export type VideoVerdict = {ok: true; durationSec: number} | {ok: false; reason: string};

export function checkVideo(facts: ProbeFacts): VideoVerdict {
	const {video, durationSec} = facts;
	if (!video) return {ok: false, reason: 'The file has no video track'};
	if (!(VIDEO_RULES.codecs as readonly string[]).includes(video.codec)) {
		return {ok: false, reason: `Unsupported video codec (${video.codec})`};
	}
	if (video.width < 1 || video.height < 1 || Math.max(video.width, video.height) > VIDEO_RULES.maxSide) {
		return {ok: false, reason: 'Unsupported video size'};
	}
	if (durationSec === null || durationSec <= 0) return {ok: false, reason: 'Could not read the video length'};
	if (durationSec > VIDEO_RULES.maxDurationSec) return {ok: false, reason: 'Videos can be at most 2 minutes long'};
	return {ok: true, durationSec};
}
