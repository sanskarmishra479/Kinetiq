import {useCurrentFrame, useVideoConfig} from 'remotion';
import {openClose, springs} from '../motion';
import {systemFont} from '../fonts';

type Props = {
	app: string;
	title: string;
	body: string;
	at: number;
	width?: number;
	style?: React.CSSProperties;
};

// macOS-style notification banner that slides in from the right edge.
// Kind: real-world replica (fixed system look; not brand-styled).
export const Notification: React.FC<Props> = ({app, title, body, at, width = 460, style}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const p = openClose(frame, fps, at, Infinity, springs.snappy);

	return (
		<div
			style={{
				position: 'absolute',
				width,
				display: 'flex',
				gap: 16,
				alignItems: 'center',
				padding: '16px 20px',
				borderRadius: 20,
				background: 'rgba(40,40,46,0.88)',
				border: '1px solid rgba(255,255,255,0.12)',
				boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
				backdropFilter: 'blur(30px)',
				fontFamily: systemFont,
				color: '#fff',
				transform: `translateX(${(1 - p) * (width + 40)}px)`,
				opacity: Math.min(1, p * 2),
				...style,
			}}
		>
			<div
				style={{
					width: 52,
					height: 52,
					flexShrink: 0,
					borderRadius: 14,
					background: 'linear-gradient(160deg, #5bf675, #28c840)',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<svg
					width={28}
					height={28}
					viewBox="0 0 24 24"
					fill="none"
					stroke="#fff"
					strokeWidth={2.2}
					strokeLinejoin="round"
				>
					<path d="M4 5h16v11H9l-5 4V5z" />
				</svg>
			</div>
			<div style={{fontSize: 17, lineHeight: 1.35}}>
				<div style={{fontWeight: 700}}>{app}</div>
				<div>
					<b>{title}</b> {body}
				</div>
			</div>
		</div>
	);
};
