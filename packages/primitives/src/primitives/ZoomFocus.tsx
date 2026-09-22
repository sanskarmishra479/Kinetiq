import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {dur, ease, tween} from '../motion';
import {fitRect, type Rect} from './focus';

type Props = {
	// The element to focus on, in scene coordinates (children fill the frame).
	rect: Rect;
	at?: number;
	until?: number;
	// Space left around the element when zoomed, as a fraction of the frame.
	padding?: number;
	maxScale?: number;
	// How blurred (in on-screen px, whatever the zoom) and darkened the rest of the scene gets.
	blur?: number;
	dim?: number;
	radius?: number;
	children: React.ReactNode;
};

// Depth of field: the camera zooms onto one element, which stays sharp and
// lifts off the page, while everything around it blurs and darkens.
// Kind: motion-only (no look of its own; only moves, blurs or frames what's inside).
export const ZoomFocus: React.FC<Props> = ({
	rect,
	at = 0,
	until,
	padding = 0.25,
	maxScale = 3,
	blur = 12,
	dim = 0.15,
	radius = 14,
	children,
}) => {
	const frame = useCurrentFrame();
	const {width: W, height: H} = useVideoConfig();
	const enter = tween(frame, [at, at + dur.slow], [0, 1], ease.inOut);
	const leave = until === undefined ? 0 : tween(frame, [until, until + dur.slow], [0, 1], ease.inOut);
	const t = enter * (1 - leave);

	const target = fitRect(rect, W, H, padding, maxScale);
	const cam = {
		x: W / 2 + (target.x - W / 2) * t,
		y: H / 2 + (target.y - H / 2) * t,
		scale: 1 + (target.scale - 1) * t,
	};
	const transform = `translate(${W / 2}px, ${H / 2}px) scale(${cam.scale}) translate(${-cam.x}px, ${-cam.y}px)`;
	const layer: React.CSSProperties = {transformOrigin: '0 0', transform};
	const clip = `inset(${rect.y}px ${W - rect.x - rect.w}px ${H - rect.y - rect.h}px ${rect.x}px round ${radius}px)`;

	return (
		<AbsoluteFill style={{overflow: 'hidden'}}>
			<AbsoluteFill
				style={{
					...layer,
					// The layer is scaled after the filter, so divide to keep the blur the same on screen.
					filter: t > 0.01 ? `blur(${(blur * t) / cam.scale}px) brightness(${1 - dim * t})` : undefined,
				}}
			>
				{children}
			</AbsoluteFill>
			{t > 0.01 && (
				<>
					<AbsoluteFill style={layer}>
						<div
							style={{
								position: 'absolute',
								left: rect.x,
								top: rect.y,
								width: rect.w,
								height: rect.h,
								borderRadius: radius,
								opacity: t,
								boxShadow: '0 12px 40px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)',
							}}
						/>
					</AbsoluteFill>
					<AbsoluteFill style={{...layer, clipPath: clip}}>{children}</AbsoluteFill>
				</>
			)}
		</AbsoluteFill>
	);
};
