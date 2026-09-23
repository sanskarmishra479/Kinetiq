import {RENDER_FPS} from '@kinetiq/shared';

// Word timings for captions and for fitting scenes to the narration.
// Pure: the mock voice uses it to fake timings, and the real provider's
// timings are converted with the same helpers (FR-VOICE-02).

export type SpokenWord = {text: string; start: number; end: number};

/** Average speaking pace, used only when a provider gives no word timings. */
export const WORDS_PER_SECOND = 2.6;

export const splitWords = (text: string) => text.split(/\s+/).filter(Boolean);

/** How long a line takes to say, in frames. */
export const spokenFrames = (text: string) => Math.ceil((splitWords(text).length / WORDS_PER_SECOND) * RENDER_FPS);

/** Even word timings for a line starting at `fromFrame` (used by the mock voice). */
export function estimateWordTimings(text: string, fromFrame = 0): SpokenWord[] {
	const words = splitWords(text);
	const per = RENDER_FPS / WORDS_PER_SECOND;
	return words.map((word, i) => ({
		text: word,
		start: Math.round(fromFrame + i * per),
		end: Math.round(fromFrame + (i + 1) * per) - 1,
	}));
}

/** Converts provider timings in seconds to frames, clamped to the video. */
export const wordsFromSeconds = (
	words: readonly {text: string; start: number; end: number}[],
	totalFrames: number,
): SpokenWord[] =>
	words.map((w) => ({
		text: w.text,
		start: Math.min(totalFrames - 1, Math.max(0, Math.round(w.start * RENDER_FPS))),
		end: Math.min(totalFrames - 1, Math.max(0, Math.round(w.end * RENDER_FPS))),
	}));
