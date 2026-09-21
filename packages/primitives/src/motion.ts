import {Easing, interpolate, spring} from 'remotion';
import type {SpringConfig} from 'remotion';

// Easing curves: the "taste" of the motion. Every primitive uses these,
// so tuning one curve here changes the feel of the whole video.
export const ease = {
	// Fast start, long soft landing. Default for things entering the frame.
	out: Easing.bezier(0.16, 1, 0.3, 1),
	// Smooth both ends. Default for camera and cursor travel.
	inOut: Easing.bezier(0.65, 0, 0.35, 1),
	// Slow start, fast finish. For things leaving the frame.
	in: Easing.bezier(0.7, 0, 0.84, 0),
};

// Spring presets for physical-feeling pops.
export const springs = {
	snappy: {damping: 20, stiffness: 220, mass: 0.6},
	bouncy: {damping: 11, stiffness: 170, mass: 0.7},
	gentle: {damping: 28, stiffness: 90, mass: 1},
} satisfies Record<string, Partial<SpringConfig>>;

// Standard durations in frames (at 30fps).
export const dur = {
	fast: 10,
	base: 18,
	slow: 30,
	stagger: 5,
};

// Clamped interpolate with our default easing.
export const tween = (
	frame: number,
	[start, end]: [number, number],
	[from, to]: [number, number],
	easing: (t: number) => number = ease.out,
) =>
	interpolate(frame, [start, end], [from, to], {
		easing,
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

// Interpolate numeric fields across a list of keyframes, easing each segment.
export type Keyframe<K extends string> = {frame: number} & Record<K, number>;

export function keyframes<K extends string>(
	frame: number,
	kfs: Keyframe<K>[],
	keys: K[],
	easing: (t: number) => number = ease.inOut,
): Record<K, number> & {t: number; segment: number} {
	const first = kfs[0];
	const last = kfs[kfs.length - 1];
	if (!first || !last) throw new Error('keyframes() needs at least one keyframe');

	const pick = (kf: Keyframe<K>) => Object.fromEntries(keys.map((k) => [k, kf[k] as number])) as Record<K, number>;

	if (frame <= first.frame) return {...pick(first), t: 0, segment: 0};
	for (let i = 0; i < kfs.length - 1; i++) {
		const a = kfs[i] as Keyframe<K>;
		const b = kfs[i + 1] as Keyframe<K>;
		if (frame <= b.frame) {
			const t = tween(frame, [a.frame, b.frame], [0, 1], easing);
			const out = Object.fromEntries(
				keys.map((k) => [k, (a[k] as number) + ((b[k] as number) - (a[k] as number)) * t]),
			) as Record<K, number>;
			return {...out, t, segment: i};
		}
	}
	return {...pick(last), t: 1, segment: Math.max(0, kfs.length - 2)};
}

// 0→1 spring when something opens at `start`, back to 0 when it closes at `end`.
export const openClose = (
	frame: number,
	fps: number,
	start: number,
	end = Infinity,
	config: Partial<SpringConfig> = springs.snappy,
) => {
	const open = spring({frame, fps, delay: start, config});
	const close = end === Infinity ? 1 : tween(frame, [end, end + dur.fast], [1, 0], ease.in);
	return open * close;
};
