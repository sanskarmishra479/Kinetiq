import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {dur, ease, springs, tween} from '../motion';
import {resolveStyle, type ResolvedStyle, type Theme, useTheme} from '../theme';
import {bentoSpan, cardColorIndex, cardStart, cardSurface, type CardVariant} from './cardStyle';
import {gridColumns} from './focus';

export type CardIcon =
	'bolt' | 'sparkle' | 'shield' | 'chart' | 'globe' | 'clock' | 'users' | 'code' | 'lock' | 'layers' | 'video' | 'wand';

export type Card = {title: string; body?: string; icon?: CardIcon};

type Props = {
	cards: Card[];
	// grid: equal cards · bento: one big hero card + smaller ones · list: typographic
	// rows with drawn dividers · steps: a numbered sequence (only for real processes).
	variant?: CardVariant;
	at?: number;
	// Frames between cards appearing.
	stagger?: number;
	// Grid/bento only. Defaults depend on the frame shape (3 wide, 2 square, 1–2 tall).
	columns?: number;
	maxWidth?: number | string;
};

// Feature cards styled by the theme (fill, border, shadow, heading font, palette),
// so each brand gets its own look instead of the same template recolored.
export const CardGrid: React.FC<Props> = ({cards, variant = 'grid', at = 0, stagger = 6, columns, maxWidth}) => {
	const {width, height} = useVideoConfig();
	const theme = useTheme();
	const s = resolveStyle(theme);
	const k = Math.min(width, height) / 1080;
	const wide = width > height;
	const box: React.CSSProperties = {
		width: maxWidth ?? (wide ? '84%' : '88%'),
		margin: '0 auto',
		fontFamily: theme.fontFamily,
	};
	const ctx = {cards, at, stagger, theme, s, k, wide};
	if (variant === 'list') return <List {...ctx} style={box} />;
	if (variant === 'steps') return <Steps {...ctx} style={box} />;
	const cols = columns ?? (variant === 'bento' ? (wide ? 3 : 2) : gridColumns(cards.length, width, height));
	return <Grid {...ctx} style={box} cols={cols} bento={variant === 'bento'} />;
};

type Ctx = {
	cards: Card[];
	at: number;
	stagger: number;
	theme: Theme;
	s: ResolvedStyle;
	k: number;
	wide: boolean;
	style: React.CSSProperties;
};

const heading = (s: ResolvedStyle, size: number): React.CSSProperties => ({
	fontFamily: s.headingFont,
	fontWeight: s.headingWeight,
	letterSpacing: `${s.headingTracking}em`,
	fontSize: size,
	lineHeight: 1.1,
});

const Grid: React.FC<Ctx & {cols: number; bento: boolean}> = ({
	cards,
	at,
	stagger,
	theme,
	s,
	k,
	style,
	cols,
	bento,
}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	return (
		<div
			style={{
				...style,
				display: 'grid',
				gridTemplateColumns: `repeat(${cols}, 1fr)`,
				gridAutoRows: bento ? `minmax(${190 * k}px, auto)` : undefined,
				gap: 20 * k,
			}}
		>
			{cards.map((card, i) => {
				const hero = bento && i === 0;
				const start = cardStart(i, bento ? 'bento' : 'grid', cols, at, stagger);
				const p = spring({frame, fps, delay: start, config: hero ? springs.gentle : springs.snappy});
				const span = bento ? bentoSpan(i, cols) : {col: 1, row: 1};
				const surf = cardSurface(theme, s, cardColorIndex(i, bento, s.palette.length), k, hero);
				return (
					<div
						key={i}
						style={{
							gridColumn: `span ${span.col}`,
							gridRow: `span ${span.row}`,
							padding: (hero ? 44 : 30) * k,
							borderRadius: theme.radius * k,
							background: surf.background,
							border: surf.border,
							boxShadow: surf.boxShadow,
							color: surf.color,
							display: 'flex',
							flexDirection: 'column',
							justifyContent: bento ? 'space-between' : 'flex-start',
							gap: 18 * k,
							opacity: Math.min(1, p * 1.5),
							transform: `translateY(${(1 - p) * 28 * k}px) scale(${hero ? 0.94 + 0.06 * p : 1})`,
						}}
					>
						{card.icon && (
							<Glyph
								name={card.icon}
								size={(hero ? 46 : 34) * k}
								color={surf.color === theme.fg ? theme.accent : surf.color}
							/>
						)}
						<div>
							<div style={heading(s, (hero ? 58 : 30) * k)}>{card.title}</div>
							{card.body && (
								<div
									style={{
										color: surf.muted,
										fontSize: (hero ? 26 : 21) * k,
										lineHeight: 1.45,
										marginTop: 10 * k,
										maxWidth: hero ? '85%' : undefined,
									}}
								>
									{card.body}
								</div>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
};

// Typographic rows: a divider draws across, then the row's text settles in.
const List: React.FC<Ctx> = ({cards, at, stagger, theme, s, k, wide, style}) => {
	const frame = useCurrentFrame();
	const rule = s.border === 'bold' ? `${3 * k}px` : `${Math.max(1, 1.5 * k)}px`;
	const ruleColor = s.border === 'bold' ? theme.fg : `color-mix(in srgb, ${theme.fg} 28%, transparent)`;
	const line = (start: number) => (
		<div
			style={{
				height: rule,
				background: ruleColor,
				transformOrigin: 'left',
				transform: `scaleX(${tween(frame, [start, start + dur.slow], [0, 1], ease.inOut)})`,
			}}
		/>
	);
	const last = cardStart(cards.length - 1, 'list', 1, at, stagger);
	return (
		<div style={style}>
			{cards.map((card, i) => {
				const start = cardStart(i, 'list', 1, at, stagger);
				const t = tween(frame, [start + 6, start + 6 + dur.base], [0, 1], ease.out);
				return (
					<div key={i}>
						{line(start)}
						<div
							style={{
								display: 'flex',
								flexDirection: wide ? 'row' : 'column',
								alignItems: wide ? 'baseline' : 'flex-start',
								gap: (wide ? 40 : 10) * k,
								padding: `${(wide ? 26 : 22) * k}px 0`,
								opacity: t,
								transform: `translateY(${(1 - t) * 14 * k}px)`,
							}}
						>
							<div style={{...heading(s, 40 * k), color: theme.fg, flex: wide ? '0 0 50%' : undefined}}>
								{card.title}
							</div>
							{card.body && (
								<div style={{color: theme.muted, fontSize: 23 * k, lineHeight: 1.45, flex: 1}}>{card.body}</div>
							)}
						</div>
					</div>
				);
			})}
			{line(last + dur.fast)}
		</div>
	);
};

// A numbered process: a line runs through the steps and each one lights up as it's reached.
const Steps: React.FC<Ctx> = ({cards, at, stagger, theme, s, k, wide, style}) => {
	const frame = useCurrentFrame();
	const n = cards.length;
	const span = n * stagger * 1.6;
	const reach = tween(frame, [at, at + span], [0, 1], (t) => t);
	const lineW = Math.max(2, 2 * k);
	const dot = 16 * k;
	return (
		<div style={{...style, position: 'relative', display: 'flex', flexDirection: wide ? 'row' : 'column', gap: 0}}>
			{/* Track and progress line. */}
			<div
				style={{
					position: 'absolute',
					...(wide
						? {left: 0, right: 0, top: dot / 2 - lineW / 2, height: lineW}
						: {top: 0, bottom: 0, left: dot / 2 - lineW / 2, width: lineW}),
					background: `color-mix(in srgb, ${theme.fg} 16%, transparent)`,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					...(wide
						? {left: 0, top: dot / 2 - lineW / 2, height: lineW, width: `${reach * 100}%`}
						: {left: dot / 2 - lineW / 2, top: 0, width: lineW, height: `${reach * 100}%`}),
					background: theme.accent,
				}}
			/>
			{cards.map((card, i) => {
				const start = cardStart(i, 'steps', 1, at, stagger);
				const on = tween(frame, [start, start + dur.fast], [0, 1], ease.out);
				const t = tween(frame, [start + 4, start + 4 + dur.base], [0, 1], ease.out);
				const color = s.palette[i % s.palette.length] ?? theme.accent;
				return (
					<div
						key={i}
						style={{
							flex: 1,
							position: 'relative',
							paddingTop: wide ? dot + 30 * k : 0,
							paddingLeft: wide ? 0 : dot + 34 * k,
							paddingRight: wide ? 36 * k : 0,
							paddingBottom: wide ? 0 : 40 * k,
						}}
					>
						<div
							style={{
								position: 'absolute',
								left: 0,
								top: 0,
								width: dot,
								height: dot,
								borderRadius: '50%',
								background: theme.bg,
								boxShadow: `inset 0 0 0 ${lineW}px ${on > 0 ? color : theme.border}`,
							}}
						>
							<div
								style={{
									width: '100%',
									height: '100%',
									borderRadius: '50%',
									background: color,
									transform: `scale(${on * 0.6})`,
								}}
							/>
						</div>
						<div style={{opacity: t, transform: `translateY(${(1 - t) * 14 * k}px)`}}>
							<div style={{...heading(s, 76 * k), color, lineHeight: 1}}>{i + 1}</div>
							<div style={{...heading(s, 30 * k), color: theme.fg, marginTop: 16 * k}}>{card.title}</div>
							{card.body && (
								<div style={{color: theme.muted, fontSize: 21 * k, lineHeight: 1.45, marginTop: 8 * k}}>
									{card.body}
								</div>
							)}
						</div>
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
