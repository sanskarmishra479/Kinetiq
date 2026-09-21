import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {springs} from '../motion';
import {useTheme} from '../theme';

// One spoken word. Frames come from the voiceover's word timestamps.
export type CaptionWord = {text: string; start: number; end: number};

type Props = {
	words: CaptionWord[];
	wordsPerPage?: number;
	fontSize?: number;
};

// Word-by-word captions: shows a few words at a time and highlights the one being spoken.
export const Captions: React.FC<Props> = ({words, wordsPerPage = 4, fontSize = 56}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const theme = useTheme();

	const pages: CaptionWord[][] = [];
	for (let i = 0; i < words.length; i += wordsPerPage) {
		pages.push(words.slice(i, i + wordsPerPage));
	}
	const page = pages.find((p) => {
		const first = p[0];
		const last = p[p.length - 1];
		return first !== undefined && last !== undefined && frame >= first.start && frame <= last.end + 6;
	});
	if (!page) return null;

	return (
		<div
			style={{
				fontFamily: theme.fontFamily,
				fontSize,
				fontWeight: 800,
				letterSpacing: '-0.02em',
				display: 'flex',
				gap: fontSize * 0.28,
				justifyContent: 'center',
			}}
		>
			{page.map((w) => {
				const active = frame >= w.start && frame <= w.end;
				const shown = frame >= w.start;
				const pop = spring({frame, fps, delay: w.start, config: springs.snappy});
				return (
					<span
						key={`${w.text}-${w.start}`}
						style={{
							color: active ? theme.accent : theme.fg,
							opacity: shown ? 1 : 0.25,
							transform: `scale(${shown ? 0.85 + pop * 0.15 : 0.85})`,
							display: 'inline-block',
						}}
					>
						{w.text}
					</span>
				);
			})}
		</div>
	);
};
