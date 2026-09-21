import {useCurrentFrame, useVideoConfig} from 'remotion';
import {useTheme} from '../theme';

type Props = {
	text: string;
	startAt?: number;
	charsPerSecond?: number;
	fontSize?: number;
	color?: string;
};

// Text that types itself out, with a caret that blinks once typing stops.
export const Typewriter: React.FC<Props> = ({
	text,
	startAt = 0,
	charsPerSecond = 22,
	fontSize = 40,
	color,
}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const theme = useTheme();

	const elapsed = Math.max(0, frame - startAt);
	const count = Math.min(text.length, Math.floor((elapsed / fps) * charsPerSecond));
	const typing = count < text.length && frame >= startAt;
	const caretOn = typing || Math.floor(frame / 16) % 2 === 0;

	return (
		<span style={{fontFamily: theme.fontFamily, fontSize, color: color ?? theme.fg, whiteSpace: 'pre'}}>
			{text.slice(0, count)}
			<span
				style={{
					display: 'inline-block',
					width: Math.max(2, fontSize * 0.06),
					height: fontSize * 1.05,
					marginLeft: 2,
					verticalAlign: 'text-bottom',
					background: theme.accent,
					opacity: caretOn ? 1 : 0,
				}}
			/>
		</span>
	);
};
