import {useTheme} from '../theme';

type Props = {
	variant?: 'mac' | 'browser';
	title?: string;
	url?: string;
	width: number;
	height: number;
	style?: React.CSSProperties;
	children: React.ReactNode;
};

const BAR_HEIGHT = 44;

// A macOS app window or a browser window to put a rebuilt product UI inside.
export const Window: React.FC<Props> = ({variant = 'browser', title, url, width, height, style, children}) => {
	const theme = useTheme();
	return (
		<div
			style={{
				width,
				height,
				borderRadius: theme.radius,
				background: theme.surface,
				border: `1px solid ${theme.border}`,
				boxShadow: '0 40px 80px -20px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.2)',
				overflow: 'hidden',
				display: 'flex',
				flexDirection: 'column',
				fontFamily: theme.fontFamily,
				...style,
			}}
		>
			<div
				style={{
					height: BAR_HEIGHT,
					flexShrink: 0,
					display: 'flex',
					alignItems: 'center',
					padding: '0 16px',
					gap: 8,
					background: theme.surfaceAlt,
					borderBottom: `1px solid ${theme.border}`,
					position: 'relative',
				}}
			>
				{['#ff5f57', '#febc2e', '#28c840'].map((c) => (
					<div key={c} style={{width: 12, height: 12, borderRadius: 6, background: c}} />
				))}
				<div
					style={{
						position: 'absolute',
						left: '50%',
						transform: 'translateX(-50%)',
						color: theme.muted,
						fontSize: 14,
						fontWeight: 500,
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						...(variant === 'browser' && {
							background: theme.surface,
							border: `1px solid ${theme.border}`,
							borderRadius: 8,
							padding: '5px 60px',
						}),
					}}
				>
					{variant === 'browser' ? (
						<>
							<svg width={12} height={12} viewBox="0 0 24 24" fill={theme.muted}>
								<path d="M6 10V8a6 6 0 1 1 12 0v2h1v12H5V10h1zm2 0h8V8a4 4 0 1 0-8 0v2z" />
							</svg>
							{url}
						</>
					) : (
						title
					)}
				</div>
			</div>
			<div style={{flex: 1, position: 'relative', overflow: 'hidden'}}>{children}</div>
		</div>
	);
};
