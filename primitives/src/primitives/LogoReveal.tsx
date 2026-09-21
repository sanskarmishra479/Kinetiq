import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {springs, tween} from '../motion';
import {useTheme} from '../theme';

type Props = {
	name: string;
	tagline?: string;
	// Custom logo mark; defaults to an accent-colored square with the first letter.
	mark?: React.ReactNode;
};

// End card: logo mark springs in, then the name wipes in beside it.
export const LogoReveal: React.FC<Props> = ({name, tagline, mark}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const theme = useTheme();

	const markIn = spring({frame, fps, config: springs.bouncy});
	const slide = spring({frame, fps, delay: 12, config: springs.gentle});
	const wipe = tween(frame, [14, 34], [0, 100]);
	const blur = tween(frame, [14, 34], [12, 0]);
	const tag = tween(frame, [30, 48], [0, 1]);

	return (
		<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', fontFamily: theme.fontFamily}}>
			<div style={{display: 'flex', alignItems: 'center', gap: 28, transform: `translateX(${(1 - slide) * 120}px)`}}>
				<div style={{transform: `scale(${markIn}) rotate(${(1 - markIn) * -90}deg)`}}>
					{mark ?? (
						<div
							style={{
								width: 120,
								height: 120,
								borderRadius: 32,
								background: theme.accent,
								color: theme.accentFg,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								fontSize: 76,
								fontWeight: 800,
							}}
						>
							{name[0]}
						</div>
					)}
				</div>
				<div
					style={{
						fontSize: 120,
						fontWeight: 800,
						letterSpacing: '-0.04em',
						color: theme.fg,
						clipPath: `inset(0 ${100 - wipe}% 0 0)`,
						filter: `blur(${blur}px)`,
					}}
				>
					{name}
				</div>
			</div>
			{tagline && (
				<div
					style={{
						marginTop: 30,
						fontSize: 36,
						color: theme.muted,
						opacity: tag,
						transform: `translateY(${(1 - tag) * 16}px)`,
					}}
				>
					{tagline}
				</div>
			)}
		</AbsoluteFill>
	);
};
