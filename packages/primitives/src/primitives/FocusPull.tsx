import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {dur} from '../motion';
import {focusPull} from './blurIn';

type Props = {
	// Scene comes into focus starting here…
	inAt?: number;
	// …and goes out of focus starting here.
	outAt?: number;
	duration?: number;
	// Blur in px when fully out of focus.
	blur?: number;
	children: React.ReactNode;
};

// A lens focus pull for a whole scene: it starts blurred and slightly zoomed,
// sharpens, and can blur away again. Use it to move between scenes softly.
// Kind: motion-only (no look of its own; only moves, blurs or frames what's inside).
export const FocusPull: React.FC<Props> = ({inAt = 0, outAt, duration = dur.slow, blur = 28, children}) => {
	const frame = useCurrentFrame();
	const f = focusPull(frame, {inAt, outAt, duration});
	return (
		<AbsoluteFill
			style={{
				opacity: f.opacity,
				transform: `scale(${f.scale})`,
				filter: f.soft > 0.01 ? `blur(${f.soft * blur}px)` : undefined,
			}}
		>
			{children}
		</AbsoluteFill>
	);
};
