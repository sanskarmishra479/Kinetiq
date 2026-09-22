import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {tween} from '../motion';
import {useTheme} from '../theme';

export type CaptionLine = {text: string; from: number; to: number};

// Creator-style captions: a short phrase in a white pill near the bottom.
// Kind: brand-styled (colors, fonts and style come from the theme).
export const CaptionPills: React.FC<{lines: CaptionLine[]; bottom?: number}> = ({lines, bottom = 90}) => (
	<>
		{lines.map((l) => (
			<Sequence key={`${l.text}-${l.from}`} from={l.from} durationInFrames={l.to - l.from} layout="none">
				<Pill text={l.text} bottom={bottom} />
			</Sequence>
		))}
	</>
);

const Pill: React.FC<{text: string; bottom: number}> = ({text, bottom}) => {
	const frame = useCurrentFrame();
	const theme = useTheme();
	const pop = tween(frame, [0, 6], [0.85, 1]);
	return (
		<AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: bottom}}>
			<div
				style={{
					background: '#fff',
					color: '#000',
					fontFamily: theme.fontFamily,
					fontSize: 34,
					fontWeight: 500,
					padding: '4px 14px',
					borderRadius: 8,
					transform: `scale(${pop})`,
					boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
				}}
			>
				{text}
			</div>
		</AbsoluteFill>
	);
};
