import {AbsoluteFill} from 'remotion';
import {useTheme} from '../theme';

// Colorful wave wallpaper in the style of recent macOS versions.
export const Wallpaper: React.FC = () => (
	<AbsoluteFill
		style={{
			background: [
				'radial-gradient(110% 80% at 0% 100%, #2f8a24 0%, #6cc04a 32%, transparent 58%)',
				'radial-gradient(90% 75% at 100% 0%, #3148d6 0%, #7b62e0 38%, transparent 62%)',
				'radial-gradient(60% 50% at 70% 85%, #9ad14c 0%, transparent 70%)',
				'linear-gradient(135deg, #c93257 0%, #ef5f6c 38%, #f39a5b 58%, #86c64a 100%)',
			].join(', '),
		}}
	/>
);

const WifiIcon = () => (
	<svg width={22} height={16} viewBox="0 0 24 18" fill="#fff">
		<path d="M12 18l3.5-4.2a5.4 5.4 0 0 0-7 0L12 18zM4.3 9.6l2 2.4a8.6 8.6 0 0 1 11.4 0l2-2.4a11.8 11.8 0 0 0-15.4 0zM0 4.5l2 2.4a15 15 0 0 1 20 0l2-2.4a18.2 18.2 0 0 0-24 0z" />
	</svg>
);

const BatteryIcon = () => (
	<svg width={30} height={15} viewBox="0 0 30 15" fill="none">
		<rect x={0.75} y={0.75} width={25} height={13.5} rx={3.5} stroke="#fff" strokeOpacity={0.6} strokeWidth={1.5} />
		<rect x={3} y={3} width={17} height={9} rx={1.5} fill="#fff" />
		<rect x={27} y={5} width={2} height={5} rx={1} fill="#fff" fillOpacity={0.6} />
	</svg>
);

// macOS menu bar: translucent strip with status icons and the clock.
export const MenuBar: React.FC<{clock: string}> = ({clock}) => {
	const theme = useTheme();
	return (
		<div
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				right: 0,
				height: 34,
				background: 'rgba(20,20,40,0.28)',
				backdropFilter: 'blur(20px)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'flex-end',
				gap: 22,
				padding: '0 22px',
				color: '#fff',
				fontFamily: theme.fontFamily,
				fontSize: 17,
				fontWeight: 500,
			}}
		>
			<WifiIcon />
			<BatteryIcon />
			<span>{clock}</span>
		</div>
	);
};

const DOCK_COLORS = [
	['#5ac8fa', '#007aff'],
	['#8e8e93', '#48484a'],
	['#34c759', '#248a3d'],
	['#ff9f0a', '#ff6b00'],
	['#ff375f', '#d70015'],
	['#bf5af2', '#8944ab'],
	['#64d2ff', '#0a84ff'],
	['#ffd60a', '#ff9f0a'],
	['#30d158', '#00a86b'],
	['#ff453a', '#c9302c'],
	['#5e5ce6', '#3634a3'],
	['#ac8e68', '#7d6548'],
	['#0a84ff', '#5e5ce6'],
	['#e5e5ea', '#aeaeb2'],
];

// Dock with generic app icons (no real brand logos).
export const Dock: React.FC = () => (
	<div
		style={{
			position: 'absolute',
			bottom: 10,
			left: '50%',
			transform: 'translateX(-50%)',
			display: 'flex',
			gap: 10,
			padding: 10,
			borderRadius: 24,
			background: 'rgba(255,255,255,0.28)',
			border: '1px solid rgba(255,255,255,0.35)',
			backdropFilter: 'blur(24px)',
		}}
	>
		{DOCK_COLORS.map(([a, b], i) => (
			<div
				key={i}
				style={{
					width: 56,
					height: 56,
					borderRadius: 14,
					background: `linear-gradient(160deg, ${a}, ${b})`,
					boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 2px 6px rgba(0,0,0,0.2)',
				}}
			/>
		))}
	</div>
);
