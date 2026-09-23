import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import {AbsoluteFill, interpolate} from 'remotion';

// How one shot hands over to the next (motion rule: one shot flows into the
// next, never a hard cut). The outgoing shot keeps pushing forward and blurs
// away; the incoming one settles into focus, like a camera racking between
// subjects.

/** Frames each hand-over takes. Scenes are lengthened by this much, so the video length is unchanged. */
export const TRANSITION_FRAMES = 14;

type Props = Record<string, never>;

const FocusPush: React.FC<TransitionPresentationComponentProps<Props>> = ({
	children,
	presentationDirection,
	presentationProgress: p,
}) => {
	const entering = presentationDirection === 'entering';
	const scale = entering ? interpolate(p, [0, 1], [0.94, 1]) : interpolate(p, [0, 1], [1, 1.12]);
	const blur = entering ? interpolate(p, [0, 1], [18, 0]) : interpolate(p, [0, 1], [0, 18]);
	const opacity = entering
		? interpolate(p, [0, 0.6], [0, 1], {extrapolateRight: 'clamp'})
		: interpolate(p, [0.4, 1], [1, 0], {extrapolateLeft: 'clamp'});
	return (
		<AbsoluteFill style={{opacity, transform: `scale(${scale})`, filter: blur > 0.2 ? `blur(${blur}px)` : undefined}}>
			{children}
		</AbsoluteFill>
	);
};

export const focusPush = (): TransitionPresentation<Props> => ({component: FocusPush, props: {}});
