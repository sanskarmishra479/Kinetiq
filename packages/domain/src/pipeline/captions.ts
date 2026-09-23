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

/** A spoken word timed in seconds, as voice providers report it. */
export type TimedWord = {text: string; start: number; end: number};

/**
 * Turns per-character timings (ElevenLabs "alignment") into per-word timings:
 * a word starts at its first character and ends at its last one.
 */
export function wordsFromCharacters(
	characters: readonly string[],
	starts: readonly number[],
	ends: readonly number[],
): TimedWord[] {
	const words: TimedWord[] = [];
	let current: TimedWord | null = null;
	characters.forEach((char, i) => {
		if (/\s/.test(char)) {
			if (current) words.push(current);
			current = null;
			return;
		}
		const start = starts[i] ?? 0;
		const end = ends[i] ?? start;
		current = current ? {...current, text: current.text + char, end} : {text: char, start, end};
	});
	if (current) words.push(current);
	return words;
}

/**
 * Spreads words over a line's real duration, in proportion to their length.
 * For voice providers that return audio but no timings (Sarvam, OpenRouter):
 * better than a fixed speaking pace, because it matches the actual audio.
 */
export function spreadWords(text: string, durationSec: number): TimedWord[] {
	const words = splitWords(text);
	const weight = (w: string) => w.length + 1;
	const total = words.reduce((sum, w) => sum + weight(w), 0);
	let at = 0;
	return words.map((word) => {
		const span = (weight(word) / total) * durationSec;
		const timed = {text: word, start: at, end: at + span * 0.92};
		at += span;
		return timed;
	});
}
