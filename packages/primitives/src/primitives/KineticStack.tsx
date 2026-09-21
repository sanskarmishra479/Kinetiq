import {useCurrentFrame} from 'remotion';
import {dur, ease, tween} from '../motion';
import {useTheme} from '../theme';

type Props = {
	lines: string[];
	fontSize?: number;
	// Each line starts further right, like a staircase.
	indent?: number;
	// Frame at which the stack leaves (lines slide up and out).
	exitAt?: number;
};

// Big stacked words that slide up from behind a mask, one line after another.
export const KineticStack: React.FC<Props> = ({lines, fontSize = 150, indent = 90, exitAt}) => {
	const frame = useCurrentFrame();
	const theme = useTheme();

	return (
		<div style={{fontFamily: theme.fontFamily, lineHeight: 0.95}}>
			{lines.map((line, i) => {
				const start = i * dur.stagger * 1.4;
				const enter = tween(frame, [start, start + dur.base], [110, 0]);
				const exit =
					exitAt === undefined ? 0 : tween(frame, [exitAt + i * 2, exitAt + i * 2 + dur.base], [0, -110], ease.in);
				const bar = tween(frame, [start + 4, start + 4 + dur.base], [0, 1]);
				return (
					<div key={line} style={{display: 'flex', alignItems: 'center', marginLeft: i * indent}}>
						{i > 0 && (
							<div
								style={{
									width: indent - 20,
									height: 4,
									marginLeft: -indent,
									marginRight: 20,
									background: theme.accent,
									transform: `scaleX(${exit === 0 ? bar : 1 + exit / 110})`,
									transformOrigin: 'left',
								}}
							/>
						)}
						<div style={{overflow: 'hidden', padding: '0.04em 0'}}>
							<div
								style={{
									fontSize,
									fontWeight: 800,
									letterSpacing: '-0.04em',
									color: theme.fg,
									transform: `translateY(${enter + exit}%)`,
								}}
							>
								{line}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
};
