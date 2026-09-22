import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {springs} from '../motion';
import {useTheme} from '../theme';
import {cardWave, gridColumns} from './focus';

export type CardIcon =
	'bolt' | 'sparkle' | 'shield' | 'chart' | 'globe' | 'clock' | 'users' | 'code' | 'lock' | 'layers' | 'video' | 'wand';

export type Card = {title: string; body?: string; icon?: CardIcon};

type Props = {
	cards: Card[];
	at?: number;
	// Frames between waves of cards.
	stagger?: number;
	// Defaults: 3 columns in 16:9, 2 in 1:1, 1–2 in 9:16.
	columns?: number;
	maxWidth?: number | string;
};

// Feature cards that pop in, in diagonal waves from the top-left.
export const CardGrid: React.FC<Props> = ({cards, at = 0, stagger = 6, columns, maxWidth}) => {
	const frame = useCurrentFrame();
	const {fps, width, height} = useVideoConfig();
	const theme = useTheme();
	const k = Math.min(width, height) / 1080;
	const cols = columns ?? gridColumns(cards.length, width, height);

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: `repeat(${cols}, 1fr)`,
				gap: 24 * k,
				width: maxWidth ?? (width > height ? '84%' : '88%'),
				margin: '0 auto',
				fontFamily: theme.fontFamily,
			}}
		>
			{cards.map((card, i) => {
				const p = spring({frame, fps, delay: at + cardWave(i, cols) * stagger, config: springs.snappy});
				return (
					<div
						key={i}
						style={{
							padding: 34 * k,
							borderRadius: theme.radius * 1.4 * k,
							background: theme.surface,
							border: `1px solid ${theme.border}`,
							boxShadow: `0 ${20 * k}px ${50 * k}px -${20 * k}px rgba(0,0,0,0.35)`,
							opacity: Math.min(1, p * 1.4),
							transform: `translateY(${(1 - p) * 44 * k}px) scale(${0.94 + p * 0.06})`,
							filter: p < 0.98 ? `blur(${(1 - Math.min(p, 1)) * 8 * k}px)` : undefined,
						}}
					>
						{card.icon && (
							<div
								style={{
									width: 60 * k,
									height: 60 * k,
									borderRadius: 16 * k,
									background: `${theme.accent}22`,
									border: `1px solid ${theme.accent}44`,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									marginBottom: 26 * k,
								}}
							>
								<Glyph name={card.icon} size={30 * k} color={theme.accent} />
							</div>
						)}
						<div style={{color: theme.fg, fontSize: 32 * k, fontWeight: 600, letterSpacing: '-0.02em'}}>
							{card.title}
						</div>
						{card.body && (
							<div style={{color: theme.muted, fontSize: 22 * k, lineHeight: 1.45, marginTop: 10 * k}}>{card.body}</div>
						)}
					</div>
				);
			})}
		</div>
	);
};

const CIRCLE = 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z';
const GLYPHS: Record<CardIcon, string> = {
	bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
	sparkle:
		'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z',
	shield: 'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6zM9 12l2 2 4-4',
	chart: 'M5 20V11M12 20V5M19 20v-6M3 20h18',
	globe: `${CIRCLE}M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18`,
	clock: `${CIRCLE}M12 7v5l3.5 2`,
	users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-3.5 3-6 7-6s7 2.5 7 6M17 11a3 3 0 1 0 0-6M22 21c0-3-2-5-5-5.5',
	code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
	lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
	layers: 'M12 3 2 8l10 5 10-5zM2 12.5l10 5 10-5M2 17l10 5 10-5',
	video: 'M3 6h12v12H3zM15 10l6-3v10l-6-3',
	wand: 'M4 20 15 9M17 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM20 12l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z',
};

const Glyph: React.FC<{name: CardIcon; size: number; color: string}> = ({name, size, color}) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke={color}
		strokeWidth={1.8}
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d={GLYPHS[name]} />
	</svg>
);
