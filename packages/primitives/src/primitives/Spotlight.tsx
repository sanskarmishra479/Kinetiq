import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {dur, ease, tween} from '../motion';
import {useTheme} from '../theme';
import {type Rect, type RectKey, rectAt} from './focus';

type Props = {
	// The element to highlight, in the same coordinates as the scene. Pass a
	// list of keyframes ({frame, x, y, w, h}) to glide between elements.
	rect: Rect | RectKey[];
	at?: number;
	until?: number;
	// How dark everything else gets (0–1).
	dim?: number;
	// Extra space around the element, and corner radius of the hole.
	padding?: number;
	radius?: number;
	// Optional pill label under the highlighted element.
	label?: string;
	labelSize?: number;
};

// Dims the whole scene except one element, which gets a glowing accent ring.
// Place it after the UI it highlights, inside the same Camera if there is one.
export const Spotlight: React.FC<Props> = ({
	rect,
	at = 0,
	until,
	dim = 0.6,
	padding = 10,
	radius = 14,
	label,
	labelSize = 20,
}) => {
	const frame = useCurrentFrame();
	const theme = useTheme();
	const enter = tween(frame, [at, at + dur.base], [0, 1], ease.out);
	const leave = until === undefined ? 0 : tween(frame, [until, until + dur.base], [0, 1], ease.in);
	const p = enter * (1 - leave);
	if (p <= 0) return null;

	const r = rectAt(frame, rect);
	const box = {left: r.x - padding, top: r.y - padding, width: r.w + padding * 2, height: r.h + padding * 2};
	const ring = 1 + (1 - enter) * 0.08;
	const labelIn = tween(frame, [at + dur.fast, at + dur.fast + dur.base], [0, 1], ease.out) * (1 - leave);

	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			{/* The dim: a huge shadow around a transparent hole. */}
			<div
				style={{
					position: 'absolute',
					...box,
					borderRadius: radius,
					boxShadow: `0 0 0 100000px rgba(0,0,0,${dim * p})`,
				}}
			/>
			{/* Accent ring with a soft glow, settling from slightly larger. */}
			<div
				style={{
					position: 'absolute',
					...box,
					borderRadius: radius,
					opacity: p,
					transform: `scale(${ring})`,
					boxShadow: `0 0 0 2px ${theme.accent}, 0 0 28px 4px ${theme.accent}88`,
				}}
			/>
			{label && (
				<div
					style={{
						position: 'absolute',
						left: box.left + box.width / 2,
						top: box.top + box.height + labelSize * 0.8,
						transform: `translate(-50%, ${(1 - labelIn) * labelSize}px)`,
						opacity: labelIn,
						background: theme.accent,
						color: theme.accentFg,
						fontFamily: theme.fontFamily,
						fontSize: labelSize,
						fontWeight: 600,
						padding: `${labelSize * 0.4}px ${labelSize * 0.8}px`,
						borderRadius: labelSize,
						whiteSpace: 'nowrap',
						boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
					}}
				>
					{label}
				</div>
			)}
		</AbsoluteFill>
	);
};
