import {useCurrentFrame, useVideoConfig} from 'remotion';
import {dur, ease, tween} from '../motion';
import {useTheme} from '../theme';
import {type BlurInBy, defaultStagger, splitUnits, unitLook, unitProgress} from './blurIn';

type Props = {
	text: string;
	// Frame the first unit starts.
	at?: number;
	// Animate letter by letter, word by word, or line by line ("\n" splits lines).
	by?: BlurInBy;
	// The line widens as words arrive and stays centered (like a sentence being spoken).
	grow?: boolean;
	// Frames between units, and how long each takes to arrive.
	stagger?: number;
	duration?: number;
	// Blur everything back out from this frame.
	exitAt?: number;
	fontSize?: number;
	weight?: number;
	color?: string;
	align?: 'left' | 'center' | 'right';
	maxWidth?: number | string;
	style?: React.CSSProperties;
};

// Text that comes into focus: each piece starts soft, faint and slightly to
// the right, then sharpens into place. The main text style of cinematic videos.
export const BlurInText: React.FC<Props> = ({
	text,
	at = 0,
	by = 'word',
	grow = false,
	stagger,
	duration = dur.base,
	exitAt,
	fontSize,
	weight = 700,
	color,
	align = 'center',
	maxWidth,
	style,
}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const theme = useTheme();
	const size = fontSize ?? Math.round(Math.min(width, height) * 0.09);
	const gap = stagger ?? defaultStagger(by);
	const maxBlur = size * 0.14;
	const shift = size * (by === 'line' ? 0.15 : 0.35);
	const {lines} = splitUnits(text, by);

	const leave = exitAt === undefined ? 0 : tween(frame, [exitAt, exitAt + dur.base], [0, 1], ease.in);

	return (
		<div
			style={{
				fontFamily: theme.fontFamily,
				fontSize: size,
				fontWeight: weight,
				color: color ?? theme.fg,
				letterSpacing: '-0.03em',
				lineHeight: 1.08,
				textAlign: align,
				maxWidth: maxWidth ?? '88%',
				marginLeft: align === 'left' ? 0 : 'auto',
				marginRight: align === 'right' ? 0 : 'auto',
				opacity: 1 - leave,
				filter: leave > 0.01 ? `blur(${leave * maxBlur * 1.5}px)` : undefined,
				...style,
			}}
		>
			{lines.map((line, li) => (
				<div key={li}>
					{line.map((word, wi) => (
						<span key={wi} style={{display: 'inline-block', whiteSpace: 'pre'}}>
							{word.map((u, ui) => {
								const p = unitProgress(frame, u.index, at, gap, duration);
								const look = unitLook(p, maxBlur, shift);
								const glyph = (
									<span
										style={{
											display: 'inline-block',
											whiteSpace: 'pre',
											opacity: look.opacity,
											transform: look.x ? `translateX(${look.x}px)` : undefined,
											filter: look.blur > 0.05 ? `blur(${look.blur}px)` : undefined,
										}}
									>
										{u.text}
									</span>
								);
								if (!grow) return <span key={ui}>{glyph}</span>;
								// A one-column grid whose column is p × the word's natural width:
								// the line widens smoothly as each word arrives.
								return (
									<span
										key={ui}
										style={{
											display: 'inline-grid',
											gridTemplateColumns: `minmax(0, ${Math.max(p, 0.0001)}fr)`,
											verticalAlign: 'top',
										}}
									>
										{glyph}
									</span>
								);
							})}
						</span>
					))}
				</div>
			))}
		</div>
	);
};
