// Pure math for <BlurInText> and <FocusPull>: how far along each piece of
// text is at a frame, and what blur/opacity/offset that means.
import {dur, ease, tween} from '../motion';

export type BlurInBy = 'char' | 'word' | 'line';

// Split text into animation units, kept inside their words and lines so the
// layout wraps like normal text. `index` is the unit's place in the stagger order.
export type BlurUnit = {text: string; index: number};
export type BlurWord = BlurUnit[];
export type BlurLine = BlurWord[];

export function splitUnits(text: string, by: BlurInBy): {lines: BlurLine[]; count: number} {
	let index = 0;
	const lines = text.split('\n').map((line): BlurLine => {
		if (by === 'line') return [[{text: line, index: index++}]];
		const words = line.split(/\s+/).filter(Boolean);
		return words.map((w, i) => {
			// Trailing space belongs to the word, so a growing line grows its gaps too.
			const withSpace = i < words.length - 1 ? `${w} ` : w;
			if (by === 'word') return [{text: withSpace, index: index++}];
			return [...withSpace].map((ch) => ({text: ch, index: ch === ' ' ? index - 1 : index++}));
		});
	});
	return {lines, count: index};
}

// Default gap between units, in frames. Letters come fast, lines slowly.
export const defaultStagger = (by: BlurInBy) => (by === 'char' ? 1.5 : by === 'word' ? dur.stagger : dur.base / 2);

// 0 → 1 for unit `i`: starts at `at + i * stagger`, lasts `duration`.
export const unitProgress = (frame: number, i: number, at: number, stagger: number, duration: number) =>
	tween(frame, [at + i * stagger, at + i * stagger + duration], [0, 1], ease.out);

// Frame when the last of `count` units has fully arrived.
export const blurInEnd = (count: number, at: number, stagger: number, duration: number) =>
	at + Math.max(0, count - 1) * stagger + duration;

// What a unit looks like at progress p. Opacity rises faster than the blur
// clears, so a letter reads as "grey and soft" before it snaps sharp.
export function unitLook(p: number, maxBlur: number, shift: number) {
	return {
		opacity: Math.min(1, p * 1.6),
		blur: (1 - p) * maxBlur,
		x: (1 - p) * shift,
	};
}

// Whole-block focus pull: blurred and slightly large → sharp; and the reverse when leaving.
export function focusPull(
	frame: number,
	{inAt = 0, outAt = Infinity, duration = dur.slow}: {inAt?: number; outAt?: number | undefined; duration?: number},
) {
	const enter = tween(frame, [inAt, inAt + duration], [0, 1], ease.out);
	const leave = outAt === Infinity ? 0 : tween(frame, [outAt, outAt + duration], [0, 1], ease.in);
	// 0 = sharp; 1 = fully blurred.
	const soft = Math.max(1 - enter, leave);
	return {
		soft,
		opacity: Math.min(enter, 1 - leave),
		scale: 1 + (1 - enter) * 0.06 + leave * 0.06,
	};
}
