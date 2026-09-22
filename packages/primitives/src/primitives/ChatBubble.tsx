import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {springs, tween} from '../motion';
import {useTheme} from '../theme';

type Props = {
	text: string;
	from: 'me' | 'them';
	delay?: number;
	fontSize?: number;
};

// A message bubble that pops in from its tail corner with a small bounce.
// Kind: brand-styled (colors, fonts and style come from the theme).
export const ChatBubble: React.FC<Props> = ({text, from, delay = 0, fontSize = 34}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const theme = useTheme();
	const pop = spring({frame, fps, delay, config: springs.bouncy});
	const mine = from === 'me';

	return (
		<div style={{display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start'}}>
			<div
				style={{
					fontFamily: theme.fontFamily,
					fontSize,
					fontWeight: 500,
					padding: `${fontSize * 0.45}px ${fontSize * 0.7}px`,
					borderRadius: fontSize * 0.9,
					[mine ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: fontSize * 0.2,
					background: mine ? theme.accent : theme.surfaceAlt,
					color: mine ? theme.accentFg : theme.fg,
					maxWidth: '70%',
					transformOrigin: mine ? 'bottom right' : 'bottom left',
					transform: `scale(${0.5 + pop * 0.5}) translateY(${(1 - pop) * 30}px)`,
					opacity: tween(frame, [delay, delay + 5], [0, 1]),
				}}
			>
				{text}
			</div>
		</div>
	);
};

// Three dots bouncing, shown while the other person is "typing".
export const TypingDots: React.FC<{from?: number; to?: number}> = ({from = 0, to = Infinity}) => {
	const frame = useCurrentFrame();
	const theme = useTheme();
	if (frame < from || frame > to) return null;
	return (
		<div
			style={{
				display: 'inline-flex',
				gap: 8,
				padding: '20px 26px',
				borderRadius: 30,
				background: theme.surfaceAlt,
			}}
		>
			{[0, 1, 2].map((i) => (
				<div
					key={i}
					style={{
						width: 12,
						height: 12,
						borderRadius: 6,
						background: theme.muted,
						transform: `translateY(${Math.sin((frame - from) / 4 - i) * 4}px)`,
					}}
				/>
			))}
		</div>
	);
};
