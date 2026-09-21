import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {springs, tween} from '../motion';
import {minimalLight, ThemeProvider, useTheme} from '../theme';
import {Background} from '../primitives/Background';
import {Camera} from '../primitives/Camera';
import {Captions, CaptionWord} from '../primitives/Captions';
import {ChatBubble, TypingDots} from '../primitives/ChatBubble';
import {Cursor, isPressed} from '../primitives/Cursor';
import {KineticStack} from '../primitives/KineticStack';
import {LogoReveal} from '../primitives/LogoReveal';
import {Typewriter} from '../primitives/Typewriter';
import {Window} from '../primitives/Window';

// Scene lengths in frames (30fps).
export const SCENES = {title: 75, product: 150, chat: 95, prompt: 100, logo: 80};

export const TitleScene: React.FC = () => (
	<Background>
		<AbsoluteFill style={{justifyContent: 'center', paddingLeft: 220}}>
			<KineticStack lines={['LAUNCH', 'VIDEOS', 'IN MINUTES']} exitAt={58} />
		</AbsoluteFill>
	</Background>
);

// Where the window and its "New video" button sit, in scene pixels.
const WIN = {left: 260, top: 130, width: 1400, height: 820};
const BUTTON = {x: WIN.left + WIN.width - 40 - 100, y: WIN.top + 44 + 22 + 24};
const CLICK = 82;

export const ProductScene: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const theme = useTheme();
	const pressed = isPressed(frame, [CLICK]);
	const toast = spring({frame, fps, delay: CLICK + 6, config: springs.snappy});
	const progress = tween(frame, [CLICK + 12, 145], [0, 100]);
	const windowIn = spring({frame, fps, config: springs.gentle});

	return (
		<Background>
			<Camera
				shots={[
					{frame: 0, x: 960, y: 560, scale: 0.9},
					{frame: 35, x: 960, y: 540, scale: 1},
					{frame: 68, x: BUTTON.x - 150, y: BUTTON.y + 60, scale: 1.9},
					{frame: 100, x: BUTTON.x - 150, y: BUTTON.y + 60, scale: 1.9},
					{frame: 132, x: 1180, y: 640, scale: 1.25},
				]}
			>
				<div
					style={{
						position: 'absolute',
						left: WIN.left,
						top: WIN.top,
						opacity: windowIn,
						transform: `translateY(${(1 - windowIn) * 60}px)`,
					}}
				>
					<Window url="app.acme.com/projects" width={WIN.width} height={WIN.height}>
						<AppUI pressed={pressed} />
						<div
							style={{
								position: 'absolute',
								right: 40,
								bottom: 40,
								width: 440,
								padding: 24,
								borderRadius: theme.radius,
								background: theme.surfaceAlt,
								border: `1px solid ${theme.border}`,
								boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
								fontFamily: theme.fontFamily,
								opacity: toast,
								transform: `translateY(${(1 - toast) * 40}px)`,
							}}
						>
							<div style={{color: theme.fg, fontSize: 22, fontWeight: 600}}>
								Generating launch video…
							</div>
							<div style={{color: theme.muted, fontSize: 17, marginTop: 6}}>
								30s · 16:9 · Dark cinematic
							</div>
							<div style={{height: 8, borderRadius: 4, background: theme.border, marginTop: 18}}>
								<div
									style={{
										height: 8,
										borderRadius: 4,
										width: `${progress}%`,
										background: theme.accent,
									}}
								/>
							</div>
						</div>
					</Window>
				</div>
				<Cursor
					path={[
						{frame: 0, x: 1150, y: 820},
						{frame: 30, x: 1150, y: 820},
						{frame: 72, x: BUTTON.x, y: BUTTON.y},
						{frame: 100, x: BUTTON.x, y: BUTTON.y},
						{frame: 130, x: 1500, y: 760},
					]}
					clicks={[CLICK]}
				/>
			</Camera>
		</Background>
	);
};

// A rebuilt product UI: the kind of thing the LLM will recreate from a user's screenshots.
const AppUI: React.FC<{pressed: boolean}> = ({pressed}) => {
	const theme = useTheme();
	const cards = [
		['#7c5cff', '#ff6ec7'],
		['#00c6ff', '#0072ff'],
		['#f7971e', '#ffd200'],
		['#11998e', '#38ef7d'],
		['#fc466b', '#3f5efb'],
		['#8e2de2', '#4a00e0'],
	];
	return (
		<AbsoluteFill style={{display: 'flex', flexDirection: 'row', fontFamily: theme.fontFamily}}>
			<div style={{width: 240, borderRight: `1px solid ${theme.border}`, padding: 24}}>
				<div style={{color: theme.fg, fontWeight: 800, fontSize: 22, marginBottom: 32}}>acme</div>
				{['Projects', 'Templates', 'Brand kit', 'Billing'].map((item, i) => (
					<div
						key={item}
						style={{
							color: i === 0 ? theme.fg : theme.muted,
							background: i === 0 ? theme.surfaceAlt : 'transparent',
							borderRadius: 8,
							padding: '10px 12px',
							fontSize: 17,
							marginBottom: 4,
						}}
					>
						{item}
					</div>
				))}
			</div>
			<div style={{flex: 1, position: 'relative', padding: '22px 40px'}}>
				<div style={{height: 48, display: 'flex', alignItems: 'center', color: theme.fg, fontSize: 30, fontWeight: 600}}>
					Projects
				</div>
				<div
					style={{
						position: 'absolute',
						top: 22,
						right: 40,
						width: 200,
						height: 48,
						borderRadius: 10,
						background: theme.accent,
						color: theme.accentFg,
						fontSize: 18,
						fontWeight: 600,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						transform: `scale(${pressed ? 0.94 : 1})`,
						boxShadow: pressed ? 'none' : `0 8px 24px ${theme.accent}66`,
					}}
				>
					+ New video
				</div>
				<div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 32}}>
					{cards.map(([a, b], i) => (
						<div key={i} style={{borderRadius: 12, overflow: 'hidden', border: `1px solid ${theme.border}`}}>
							<div style={{height: 170, background: `linear-gradient(135deg, ${a}, ${b})`}} />
							<div style={{padding: 14}}>
								<div style={{height: 12, width: '60%', borderRadius: 6, background: theme.muted, opacity: 0.5}} />
								<div style={{height: 10, width: '35%', borderRadius: 5, background: theme.muted, opacity: 0.25, marginTop: 10}} />
							</div>
						</div>
					))}
				</div>
			</div>
		</AbsoluteFill>
	);
};

export const ChatScene: React.FC = () => (
	<ThemeProvider value={minimalLight}>
		<Background glow={false}>
			<AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
				<div style={{width: 1400, display: 'flex', flexDirection: 'column', gap: 30}}>
					<ChatBubble fontSize={58} from="them" text="Launch is in 5 mins!! Where's the video?" />
					<TypingDots from={14} to={34} />
					<ChatBubble fontSize={58} from="me" delay={36} text="Already done. Made it with Kinetiq" />
					<ChatBubble fontSize={58} from="them" delay={62} text="wait… how??" />
				</div>
			</AbsoluteFill>
		</Background>
	</ThemeProvider>
);

const PROMPT_CAPTIONS: CaptionWord[] = [
	{text: 'Just', start: 8, end: 14},
	{text: 'paste', start: 14, end: 22},
	{text: 'your', start: 22, end: 28},
	{text: 'URL', start: 28, end: 40},
	{text: 'and', start: 50, end: 55},
	{text: 'hit', start: 55, end: 62},
	{text: 'send.', start: 62, end: 80},
];

export const PromptScene: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const theme = useTheme();
	const box = spring({frame, fps, config: springs.gentle});
	const send = spring({frame, fps, delay: 66, config: springs.bouncy});

	return (
		<Background>
			<AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
				<div
					style={{
						width: 1300,
						height: 120,
						borderRadius: 60,
						background: theme.surface,
						border: `1px solid ${theme.border}`,
						boxShadow: `0 30px 80px -20px ${theme.accent}55`,
						display: 'flex',
						alignItems: 'center',
						padding: '0 18px 0 48px',
						transform: `scale(${0.9 + box * 0.1})`,
						opacity: box,
					}}
				>
					<div style={{flex: 1}}>
						<Typewriter text="Make a 30s launch video for acme.com" startAt={10} fontSize={42} />
					</div>
					<div
						style={{
							width: 84,
							height: 84,
							borderRadius: 42,
							background: theme.accent,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							transform: `scale(${1 + Math.sin(send * Math.PI) * 0.15})`,
						}}
					>
						<svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
							<path d="M5 12h14M13 6l6 6-6 6" />
						</svg>
					</div>
				</div>
			</AbsoluteFill>
			<AbsoluteFill style={{justifyContent: 'flex-end', paddingBottom: 110}}>
				<Captions words={PROMPT_CAPTIONS} />
			</AbsoluteFill>
		</Background>
	);
};

export const LogoScene: React.FC = () => (
	<Background>
		<LogoReveal name="Kinetiq" tagline="URL to video." />
	</Background>
);
