import {linearTiming, TransitionSeries} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {springs} from '../motion';
import {darkCinematic, minimalLight, ThemeProvider, useTheme} from '../theme';
import {Background} from '../primitives/Background';
import {Browser} from '../primitives/Browser';
import {browserLayout, browserTimeline, chromeScale} from '../primitives/browserLayout';
import {Camera} from '../primitives/Camera';

const LIGHT = 170;
const DARK = 140;
const FADE = 14;
export const BROWSER_DEMO_DURATION = LIGHT + DARK - FADE;

// Window placement in a 1920×1080 frame.
const WIN = {left: 140, top: 80, width: 1640, height: 920};
const URL = 'kinetiq.so';
const TYPE_AT = 14;

// Light: camera close on the address bar, URL types in, page loads, pull back, scroll.
const LightPart: React.FC = () => {
	const {fps} = useVideoConfig();
	const L = browserLayout(WIN.width, chromeScale(WIN.width, 1080));
	const bar = {x: WIN.left + WIN.width / 2, y: WIN.top + L.toolbar / 2};
	const tl = browserTimeline(URL, TYPE_AT, fps);
	return (
		<ThemeProvider value={minimalLight}>
			<Background>
				<Camera
					shots={[
						{frame: 0, x: bar.x - 60, y: bar.y + 40, scale: 2.4},
						{frame: tl.loadEnd, x: bar.x, y: bar.y + 40, scale: 2.4},
						{frame: tl.loadEnd + 28, x: 960, y: 540, scale: 1},
					]}
				>
					<Entering>
						<Browser
							url={URL}
							width={WIN.width}
							height={WIN.height}
							typeAt={TYPE_AT}
							scroll={[
								{frame: 104, y: 0},
								{frame: 150, y: 780},
							]}
							contentHeight={2100}
						>
							<SiteMock width={WIN.width} />
						</Browser>
					</Entering>
				</Camera>
			</Background>
		</ThemeProvider>
	);
};

// Dark: same site, dark theme, with a path in the URL; slow push-in while scrolling.
const DarkPart: React.FC = () => (
	<ThemeProvider value={darkCinematic}>
		<Background>
			<Camera
				shots={[
					{frame: 0, x: 960, y: 540, scale: 1},
					{frame: DARK, x: 1000, y: 520, scale: 1.1},
				]}
			>
				<div style={{position: 'absolute', left: WIN.left, top: WIN.top}}>
					<Browser
						url="https://www.kinetiq.so/gallery"
						width={WIN.width}
						height={WIN.height}
						scroll={[
							{frame: 30, y: 0},
							{frame: 95, y: 1100},
						]}
						contentHeight={2100}
					>
						<SiteMock width={WIN.width} />
					</Browser>
				</div>
			</Camera>
		</Background>
	</ThemeProvider>
);

export const BrowserDemo: React.FC = () => (
	<TransitionSeries>
		<TransitionSeries.Sequence durationInFrames={LIGHT}>
			<LightPart />
		</TransitionSeries.Sequence>
		<TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: FADE})} />
		<TransitionSeries.Sequence durationInFrames={DARK}>
			<DarkPart />
		</TransitionSeries.Sequence>
	</TransitionSeries>
);

// 9:16 check: same primitive in a vertical video switches to compact chrome.
export const BROWSER_VERTICAL_DURATION = 150;
export const BrowserDemoVertical: React.FC = () => {
	const w = 960;
	return (
		<ThemeProvider value={minimalLight}>
			<Background>
				<AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
					<Browser
						url="kinetiq.so"
						width={w}
						height={1500}
						typeAt={10}
						scroll={[
							{frame: 80, y: 0},
							{frame: 140, y: 900},
						]}
						contentHeight={2600}
					>
						<SiteMock width={w} />
					</Browser>
				</AbsoluteFill>
			</Background>
		</ThemeProvider>
	);
};

const Entering: React.FC<{children: React.ReactNode}> = ({children}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const p = spring({frame, fps, config: springs.gentle});
	return (
		<div
			style={{
				position: 'absolute',
				left: WIN.left,
				top: WIN.top,
				opacity: Math.min(1, p * 1.5),
				transform: `translateY(${(1 - p) * 40}px) scale(${0.97 + p * 0.03})`,
			}}
		>
			{children}
		</div>
	);
};

// A rebuilt landing page: the kind of page the scene coder recreates from a customer's site.
const SiteMock: React.FC<{width: number}> = ({width}) => {
	const theme = useTheme();
	const narrow = width < 1200;
	const k = narrow ? width / 900 : width / 1640;
	const u = (n: number) => n * k;
	const pad = narrow ? u(44) : u(96);
	const thumbs = [
		['#7c5cff', '#ff6ec7'],
		['#00c6ff', '#0072ff'],
		['#f7971e', '#ffd200'],
		['#11998e', '#38ef7d'],
		['#fc466b', '#3f5efb'],
		['#8e2de2', '#4a00e0'],
	];
	const line = (w: string | number, o = 0.5, h = u(12)) => (
		<div style={{height: h, width: w, borderRadius: h / 2, background: theme.muted, opacity: o}} />
	);
	return (
		<div style={{background: theme.bg, color: theme.fg, fontFamily: theme.fontFamily, minHeight: '100%'}}>
			{/* Nav */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					height: u(76),
					padding: `0 ${pad}px`,
					borderBottom: `1px solid ${theme.border}`,
				}}
			>
				<div style={{display: 'flex', alignItems: 'center', gap: u(10), fontWeight: 800, fontSize: u(22)}}>
					<div
						style={{
							width: u(28),
							height: u(28),
							borderRadius: u(8),
							background: `linear-gradient(135deg, ${theme.accent}, #ff6ec7)`,
						}}
					/>
					Kinetiq
				</div>
				{!narrow && (
					<div
						style={{
							display: 'flex',
							gap: u(36),
							marginLeft: u(64),
							color: theme.muted,
							fontSize: u(16),
							fontWeight: 500,
						}}
					>
						<span>Gallery</span>
						<span>Pricing</span>
						<span>Docs</span>
						<span>Changelog</span>
					</div>
				)}
				<div style={{flex: 1}} />
				{!narrow && (
					<span style={{color: theme.muted, fontSize: u(16), fontWeight: 500, marginRight: u(24)}}>Sign in</span>
				)}
				<div
					style={{
						background: theme.fg,
						color: theme.bg,
						fontSize: u(15),
						fontWeight: 600,
						padding: `${u(10)}px ${u(18)}px`,
						borderRadius: u(10),
					}}
				>
					Get started
				</div>
			</div>

			{/* Hero */}
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					textAlign: 'center',
					padding: `${u(100)}px ${pad}px ${u(80)}px`,
				}}
			>
				<div
					style={{
						fontSize: u(14),
						fontWeight: 600,
						color: theme.accent,
						background: `${theme.accent}18`,
						border: `1px solid ${theme.accent}40`,
						padding: `${u(6)}px ${u(14)}px`,
						borderRadius: u(20),
					}}
				>
					New · Launch videos in minutes
				</div>
				<div
					style={{
						fontSize: u(narrow ? 84 : 104),
						fontWeight: 800,
						letterSpacing: '-0.045em',
						lineHeight: 1,
						marginTop: u(28),
					}}
				>
					URL to video.
				</div>
				<div style={{fontSize: u(22), color: theme.muted, marginTop: u(24), maxWidth: u(640), lineHeight: 1.45}}>
					Paste your website. Get a motion-designed launch video with camera moves, captions and music.
				</div>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						width: narrow ? '100%' : u(720),
						height: u(68),
						marginTop: u(40),
						padding: `0 ${u(8)}px 0 ${u(24)}px`,
						borderRadius: u(16),
						background: theme.surface,
						border: `1px solid ${theme.border}`,
						boxShadow: `0 20px 50px -20px ${theme.accent}55`,
						boxSizing: 'border-box',
					}}
				>
					<span style={{flex: 1, textAlign: 'left', color: theme.muted, fontSize: u(18)}}>
						https://your-startup.com
					</span>
					<div
						style={{
							background: theme.accent,
							color: theme.accentFg,
							fontWeight: 600,
							fontSize: u(16),
							padding: `${u(14)}px ${u(22)}px`,
							borderRadius: u(11),
						}}
					>
						Generate
					</div>
				</div>
			</div>

			{/* Gallery */}
			<div style={{padding: `0 ${pad}px ${u(80)}px`}}>
				<div style={{fontSize: u(30), fontWeight: 700, letterSpacing: '-0.02em', marginBottom: u(28)}}>
					Made with Kinetiq
				</div>
				<div style={{display: 'grid', gridTemplateColumns: narrow ? '1fr 1fr' : 'repeat(3, 1fr)', gap: u(24)}}>
					{thumbs.map(([a, b], i) => (
						<div
							key={i}
							style={{
								borderRadius: u(14),
								overflow: 'hidden',
								border: `1px solid ${theme.border}`,
								background: theme.surface,
							}}
						>
							<div
								style={{
									aspectRatio: '16 / 9',
									background: `linear-gradient(135deg, ${a}, ${b})`,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
								}}
							>
								<div
									style={{
										width: u(52),
										height: u(52),
										borderRadius: '50%',
										background: 'rgba(255,255,255,0.28)',
										backdropFilter: 'blur(8px)',
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
									}}
								>
									<svg width={u(20)} height={u(20)} viewBox="0 0 16 16" fill="#fff">
										<path d="M4 2.5l10 5.5-10 5.5z" />
									</svg>
								</div>
							</div>
							<div style={{padding: u(16), display: 'flex', flexDirection: 'column', gap: u(10)}}>
								{line('62%', 0.55)}
								{line('36%', 0.3, u(10))}
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Features */}
			<div style={{padding: `0 ${pad}px ${u(120)}px`}}>
				<div style={{fontSize: u(30), fontWeight: 700, letterSpacing: '-0.02em', marginBottom: u(28)}}>
					How it works
				</div>
				<div style={{display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(3, 1fr)', gap: u(24)}}>
					{['Paste a URL', 'Pick a style', 'Get your video'].map((t, i) => (
						<div
							key={t}
							style={{
								padding: u(28),
								borderRadius: u(16),
								background: theme.surface,
								border: `1px solid ${theme.border}`,
							}}
						>
							<div
								style={{
									width: u(40),
									height: u(40),
									borderRadius: u(10),
									background: `${theme.accent}22`,
									color: theme.accent,
									fontWeight: 700,
									fontSize: u(18),
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
								}}
							>
								{i + 1}
							</div>
							<div style={{fontSize: u(20), fontWeight: 600, marginTop: u(18)}}>{t}</div>
							<div style={{display: 'flex', flexDirection: 'column', gap: u(10), marginTop: u(14)}}>
								{line('90%', 0.25, u(10))}
								{line('70%', 0.25, u(10))}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};
