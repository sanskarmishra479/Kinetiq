import {AbsoluteFill, Sequence, useVideoConfig} from 'remotion';
import {darkCinematic, minimalLight, ThemeProvider, useTheme} from '../theme';
import {Background} from '../primitives/Background';
import {BlurInText} from '../primitives/BlurInText';
import {FocusPull} from '../primitives/FocusPull';

// Three beats, each a different BlurInText mode, joined by focus pulls.
const A = {from: 0, len: 92};
const B = {from: 78, len: 96};
const C = {from: 160, len: 110};
export const BLUR_IN_DEMO_DURATION = C.from + C.len;

const Center: React.FC<{children: React.ReactNode; gap?: number}> = ({children, gap = 0}) => (
	<AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap}}>
		{children}
	</AbsoluteFill>
);

// Word by word, the line growing and re-centering as it's "spoken".
const GrowBeat: React.FC = () => {
	const {width, height} = useVideoConfig();
	const k = Math.min(width, height) / 1080;
	return (
		<ThemeProvider value={minimalLight}>
			<Background glow={false}>
				<FocusPull inAt={-30} outAt={A.len - 16} duration={16}>
					<Center>
						<BlurInText text="We built a video team." grow at={6} fontSize={150 * k} weight={800} />
					</Center>
				</FocusPull>
			</Background>
		</ThemeProvider>
	);
};

// Letter by letter, then a quieter line word by word.
const CharBeat: React.FC = () => {
	const {width, height} = useVideoConfig();
	const theme = useTheme();
	const k = Math.min(width, height) / 1080;
	return (
		<ThemeProvider value={minimalLight}>
			<Background glow={false}>
				<FocusPull inAt={0} outAt={B.len - 16} duration={16}>
					<Center gap={28 * k}>
						<BlurInText text="URL to video." by="char" at={10} fontSize={130 * k} weight={700} />
						<BlurInText
							text="Paste a link. Get a launch film."
							at={42}
							fontSize={42 * k}
							weight={500}
							color={theme.muted}
						/>
					</Center>
				</FocusPull>
			</Background>
		</ThemeProvider>
	);
};

// End card: whole lines, soft and quiet, on black.
const TitleBeat: React.FC = () => {
	const {width, height} = useVideoConfig();
	const k = Math.min(width, height) / 1080;
	return (
		<ThemeProvider value={{...darkCinematic, bg: '#000000'}}>
			<Background glow={false}>
				<FocusPull inAt={0} duration={16}>
					<Center gap={10 * k}>
						<BlurInText text="Step out of the edit." by="line" at={14} exitAt={88} fontSize={64 * k} weight={500} />
						<BlurInText
							text="comment “Kinetiq”"
							by="line"
							at={34}
							exitAt={88}
							fontSize={26 * k}
							weight={400}
							color={darkCinematic.muted}
						/>
					</Center>
				</FocusPull>
			</Background>
		</ThemeProvider>
	);
};

export const BlurInDemo: React.FC = () => (
	<AbsoluteFill style={{background: '#000'}}>
		<Sequence from={A.from} durationInFrames={A.len}>
			<GrowBeat />
		</Sequence>
		<Sequence from={B.from} durationInFrames={B.len}>
			<CharBeat />
		</Sequence>
		<Sequence from={C.from} durationInFrames={C.len}>
			<TitleBeat />
		</Sequence>
	</AbsoluteFill>
);
