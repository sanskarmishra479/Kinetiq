import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {keyframes} from '../motion';

// A camera shot: look at point (x, y) of the scene at zoom `scale`.
export type Shot = {frame: number; x: number; y: number; scale: number};

type Props = {
	shots: Shot[];
	// Blur while the camera moves fast, like a real lens.
	motionBlur?: boolean;
	children: React.ReactNode;
};

export const Camera: React.FC<Props> = ({shots, motionBlur = true, children}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const keys: ('x' | 'y' | 'scale')[] = ['x', 'y', 'scale'];
	const now = keyframes(frame, shots, keys);
	const prev = keyframes(frame - 1, shots, keys);

	// Screen-space speed of the move, in pixels per frame.
	const speed = Math.hypot(
		(now.x - prev.x) * now.scale,
		(now.y - prev.y) * now.scale,
		(now.scale - prev.scale) * width * 0.25,
	);
	const blur = motionBlur ? Math.min(speed * 0.03, 3) : 0;

	return (
		<AbsoluteFill style={{overflow: 'hidden'}}>
			<AbsoluteFill
				style={{
					transformOrigin: '0 0',
					transform: `translate(${width / 2}px, ${height / 2}px) scale(${now.scale}) translate(${-now.x}px, ${-now.y}px)`,
					filter: blur > 0.3 ? `blur(${blur}px)` : undefined,
				}}
			>
				{children}
			</AbsoluteFill>
		</AbsoluteFill>
	);
};
