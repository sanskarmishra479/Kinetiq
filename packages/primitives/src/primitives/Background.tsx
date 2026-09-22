import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {useTheme} from '../theme';

// Scene background with a soft accent glow that slowly drifts.
// Kind: brand-styled (colors, fonts and style come from the theme).
export const Background: React.FC<{glow?: boolean; children?: React.ReactNode}> = ({glow = true, children}) => {
	const frame = useCurrentFrame();
	const theme = useTheme();
	const x = 50 + Math.sin(frame / 60) * 8;
	const y = 40 + Math.cos(frame / 75) * 6;
	return (
		<AbsoluteFill
			style={{
				background: glow
					? `radial-gradient(circle at ${x}% ${y}%, ${theme.accent}33 0%, transparent 55%), ${theme.bg}`
					: theme.bg,
			}}
		>
			{children}
		</AbsoluteFill>
	);
};
