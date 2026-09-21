import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {ease, keyframes, tween} from '../motion';

export type CursorPoint = {frame: number; x: number; y: number};

type Props = {
	path: CursorPoint[];
	// Frames at which the cursor clicks.
	clicks?: number[];
	// How much the path curves (0 = straight line). Real hands move in arcs.
	arc?: number;
	// Cursor is hidden before this frame.
	hideBefore?: number;
};

const RIPPLE_FRAMES = 18;

// Where the cursor tip is at a frame (ignoring the arc). Lets menus and
// buttons react to hover without hand-timing every highlight.
export const cursorAt = (frame: number, path: CursorPoint[]) => keyframes(frame, path, ['x', 'y']);

export const Cursor: React.FC<Props> = ({path, clicks = [], arc = 0.12, hideBefore = -Infinity}) => {
	const frame = useCurrentFrame();
	const {x, y, t, segment} = keyframes(frame, path, ['x', 'y']);
	if (frame < hideBefore) return null;

	// Push the point sideways in the middle of each move to make an arc.
	const a = path[segment];
	if (!a) return null;
	const b = path[segment + 1] ?? a;
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const bend = Math.sin(Math.PI * t) * arc;
	const cx = x - dy * bend;
	const cy = y + dx * bend;

	// Press: shrink fast, release slower.
	const press = clicks.reduce((s, c) => {
		if (frame < c - 3 || frame > c + 8) return s;
		return frame <= c ? tween(frame, [c - 3, c], [1, 0.82]) : tween(frame, [c, c + 8], [0.82, 1]);
	}, 1);

	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			{clicks.map((c) => {
				if (frame < c || frame > c + RIPPLE_FRAMES) return null;
				const p = tween(frame, [c, c + RIPPLE_FRAMES], [0, 1], ease.out);
				const clickPos = keyframes(c, path, ['x', 'y']);
				return (
					<div
						key={c}
						style={{
							position: 'absolute',
							left: clickPos.x - 30,
							top: clickPos.y - 30,
							width: 60,
							height: 60,
							borderRadius: '50%',
							border: '3px solid rgba(255,255,255,0.9)',
							transform: `scale(${0.3 + p * 1.4})`,
							opacity: 1 - p,
						}}
					/>
				);
			})}
			<svg
				width={36}
				height={36}
				viewBox="0 0 24 24"
				style={{
					position: 'absolute',
					left: cx - 6,
					top: cy - 3,
					transform: `scale(${press})`,
					transformOrigin: '6px 3px',
					filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.35))',
				}}
			>
				<path
					d="M5.5 3.2 L5.5 19.5 L9.7 15.6 L12.4 21.4 L15.2 20.1 L12.6 14.4 L18.4 14.2 Z"
					fill="#fff"
					stroke="#000"
					strokeWidth={1.3}
					strokeLinejoin="round"
				/>
			</svg>
		</AbsoluteFill>
	);
};

// True for a few frames after a click: lets UI elements react (button press).
export const isPressed = (frame: number, clicks: number[]) => clicks.some((c) => frame >= c - 2 && frame <= c + 5);
