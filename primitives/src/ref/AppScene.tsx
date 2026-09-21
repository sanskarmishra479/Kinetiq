import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {keyframes, openClose, tween} from '../motion';
import {useTheme} from '../theme';
import {Camera} from '../primitives/Camera';
import {Cursor, cursorAt, CursorPoint, isPressed} from '../primitives/Cursor';
import {Chip, Dropdown, menuRowY} from '../primitives/Menu';
import {Typewriter} from '../primitives/Typewriter';

export const APP_SCENE = 280;

// Layout of the prompt page, in scene pixels.
const CHROME = {top: 60, height: 56};
const BOX = {left: 560, top: 300, width: 800, height: 160};
const CHIP_Y = BOX.top + BOX.height - 51;
const ASPECT = {x: 612, w: 104};
const DURATION = {x: 728, w: 134};
const DESIGN = {x: 874, w: 128};
const MENU_TOP = 452;
const PANEL = {left: 700, top: 452, width: 500, height: 600};
const PANEL_PAD = 20;
const HEADER_H = 84;
const LABEL_H = 34;
const CREATE_H = 42;
const PRESET_H = 62;
const PRESET_Y0 = PANEL.top + PANEL_PAD + HEADER_H + LABEL_H + 3 * CREATE_H + LABEL_H;

const chipCenter = (c: {x: number; w: number}) => ({x: c.x + c.w / 2, y: CHIP_Y + 17});

// Timeline (frames within this scene), matched to the original's beats.
const T = {
	urlType: 8,
	pageLoad: 36,
	promptType: 66,
	aspectClick: 116,
	aspectPick: 130,
	durationClick: 146,
	durationPick: 164,
	designClick: 176,
	presetClick: 270,
};

const SHOTS = [
	{frame: 0, x: 960, y: 88, scale: 2.8},
	{frame: 36, x: 960, y: 88, scale: 2.8},
	{frame: 48, x: 960, y: 600, scale: 1.12},
	{frame: 56, x: 960, y: 600, scale: 1.12},
	{frame: 68, x: 820, y: 345, scale: 2.2},
	{frame: 100, x: 870, y: 345, scale: 2.2},
	{frame: 112, x: 760, y: 440, scale: 2.4},
	{frame: 140, x: 800, y: 460, scale: 2.4},
	{frame: 170, x: 860, y: 470, scale: 2.4},
	{frame: 188, x: 950, y: 740, scale: 2},
	{frame: 280, x: 950, y: 720, scale: 2},
];

const a = chipCenter(ASPECT);
const d = chipCenter(DURATION);
const g = chipCenter(DESIGN);
const PRESET_TARGET = {x: 820, y: PRESET_Y0 + PRESET_H / 2};

const PATH: CursorPoint[] = [
	{frame: 56, x: 1150, y: 720},
	{frame: 104, x: 1100, y: 560},
	{frame: 114, ...a},
	{frame: 120, ...a},
	{frame: 127, x: 700, y: menuRowY(MENU_TOP, 0)},
	{frame: 134, x: 700, y: menuRowY(MENU_TOP, 0)},
	{frame: 144, ...d},
	{frame: 149, ...d},
	{frame: 154, x: 800, y: menuRowY(MENU_TOP, 0)},
	{frame: 158, x: 805, y: menuRowY(MENU_TOP, 1)},
	{frame: 162, x: 810, y: menuRowY(MENU_TOP, 2)},
	{frame: 168, x: 810, y: menuRowY(MENU_TOP, 2)},
	{frame: 174, ...g},
	{frame: 182, ...g},
	{frame: 194, x: 1020, y: 820},
	{frame: 250, x: 1020, y: 820},
	{frame: 262, ...PRESET_TARGET},
];
const CLICKS = [T.aspectClick, T.aspectPick, T.durationClick, T.durationPick, T.designClick, T.presetClick];

export const AppScene: React.FC = () => {
	const frame = useCurrentFrame();
	const theme = useTheme();
	const cursor = cursorAt(frame, PATH);
	const loaded = tween(frame, [T.pageLoad, T.pageLoad + 12], [0, 1]);

	return (
		<AbsoluteFill style={{background: '#050507'}}>
			<Camera shots={SHOTS}>
				{/* Wallpaper peeking above the browser window */}
				<div
					style={{
						position: 'absolute',
						left: -400,
						right: -400,
						top: -500,
						height: 500 + CHROME.top,
						background: 'linear-gradient(100deg, #e0506b, #c46ad6 60%, #8a7df0)',
					}}
				/>
				<div
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						top: CHROME.top,
						height: CHROME.height,
						background: '#1c1c21',
						borderBottom: `1px solid ${theme.border}`,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<div
						style={{
							width: 700,
							height: 38,
							borderRadius: 10,
							background: '#26262c',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							gap: 10,
						}}
					>
						<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={theme.muted} strokeWidth={2.2}>
							<rect x={5} y={10} width={14} height={11} rx={2} />
							<path d="M8 10V7a4 4 0 0 1 8 0v3" />
						</svg>
						<Typewriter text="kinetiq.so" startAt={T.urlType} charsPerSecond={14} fontSize={18} />
					</div>
				</div>
				<div
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						top: CHROME.top + CHROME.height,
						height: 1400,
						background: `radial-gradient(60% 40% at 50% 0%, rgba(124,92,255,0.22), transparent 70%), #0b0b10`,
					}}
				/>
				<AbsoluteFill style={{opacity: loaded}}>
					<PromptBox />
					<Dropdown
						left={ASPECT.x}
						top={MENU_TOP}
						width={300}
						openAt={T.aspectClick + 2}
						closeAt={T.aspectPick + 3}
						cursor={cursor}
						selected={frame >= T.aspectPick ? 0 : undefined}
						items={[
							{label: '16:9', hint: 'Landscape', icon: <RatioIcon w={16} h={10} />},
							{label: '9:16', hint: 'Portrait', icon: <RatioIcon w={10} h={16} />},
							{label: '1:1', hint: 'Square', icon: <RatioIcon w={13} h={13} />},
						]}
					/>
					<Dropdown
						left={DURATION.x}
						top={MENU_TOP}
						width={320}
						openAt={T.durationClick + 2}
						closeAt={T.durationPick + 3}
						cursor={cursor}
						selected={frame >= T.durationPick ? 2 : undefined}
						items={[
							{label: 'Under 10s', hint: 'Quick', icon: <ClockIcon />},
							{label: '10–30s', hint: 'Short', icon: <ClockIcon />},
							{label: '30s–1 min', hint: 'Standard', icon: <ClockIcon />},
						]}
					/>
					<DesignPanel cursor={cursor} />
				</AbsoluteFill>
				<Cursor path={PATH} clicks={CLICKS} hideBefore={56} />
			</Camera>
		</AbsoluteFill>
	);
};

const PromptBox: React.FC = () => {
	const frame = useCurrentFrame();
	const theme = useTheme();
	const aspectSet = frame >= T.aspectPick;
	const durationSet = frame >= T.durationPick;

	return (
		<div
			style={{
				position: 'absolute',
				left: BOX.left,
				top: BOX.top,
				width: BOX.width,
				height: BOX.height,
				borderRadius: 18,
				background: '#16161b',
				border: `1px solid ${theme.border}`,
				boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
				fontFamily: theme.fontFamily,
			}}
		>
			<div style={{position: 'absolute', left: 28, top: 24, fontSize: 22}}>
				{frame < T.promptType ? (
					<span style={{color: theme.muted}}>Make a launch video for my product…</span>
				) : (
					<Typewriter text="Make a 30-second launch video for" startAt={T.promptType} charsPerSecond={25} fontSize={22} />
				)}
			</div>
			{/* Chips are positioned in scene pixels, so offset by the box origin. */}
			<div style={{position: 'absolute', left: -BOX.left, top: -BOX.top}}>
				<svg
					width={16}
					height={16}
					viewBox="0 0 16 16"
					stroke={theme.muted}
					strokeWidth={1.6}
					style={{position: 'absolute', left: 580, top: CHIP_Y + 9}}
				>
					<path d="M8 2v12M2 8h12" />
				</svg>
				<Chip
					x={ASPECT.x}
					y={CHIP_Y}
					width={ASPECT.w}
					icon={<RatioIcon w={14} h={10} />}
					label={aspectSet ? '16:9' : 'Aspect'}
					active={aspectSet}
					pressed={isPressed(frame, [T.aspectClick])}
				/>
				<Chip
					x={DURATION.x}
					y={CHIP_Y}
					width={DURATION.w}
					icon={<ClockIcon />}
					label={durationSet ? '30s–1 min' : 'Duration'}
					active={durationSet}
					pressed={isPressed(frame, [T.durationClick])}
				/>
				<Chip
					x={DESIGN.x}
					y={CHIP_Y}
					width={DESIGN.w}
					icon={<FileIcon />}
					label="DESIGN.md"
					caret={false}
					active={frame >= T.designClick}
					pressed={isPressed(frame, [T.designClick])}
				/>
				<div
					style={{
						position: 'absolute',
						left: 1180,
						top: CHIP_Y + 7,
						color: theme.muted,
						fontSize: 15,
						display: 'flex',
						alignItems: 'center',
						gap: 6,
					}}
				>
					<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
						<path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />
					</svg>
					Plan
				</div>
				<div
					style={{
						position: 'absolute',
						left: 1310,
						top: CHIP_Y - 1,
						width: 36,
						height: 36,
						borderRadius: 18,
						background: '#fff',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth={2.6} strokeLinecap="round">
						<path d="M12 19V5M6 11l6-6 6 6" />
					</svg>
				</div>
			</div>
		</div>
	);
};

const PRESETS: [string, string, string, string][] = [
	['Dark cinematic', 'Deep black canvas, violet glow, soft grain', '#7c5cff', '#16161b'],
	['Minimal premium', 'Lots of white space, crisp type, slow moves', '#ffffff', '#d4d4d8'],
	['Warm editorial', 'Cream paper, serif headlines, terracotta', '#f2e8d8', '#c8643c'],
	['Bold kinetic', 'Huge uppercase type, fast hard cuts', '#ffdd00', '#111111'],
	['Playful illustrated', 'Hand-drawn shapes, bouncy springs', '#ff8fab', '#5ec8f2'],
	['Neon tech', 'Dark UI, neon green accents, glow', '#39ff88', '#0a0a0a'],
	['Soft pastel', 'Pastel gradients, rounded everything', '#c7b8ff', '#ffd6e8'],
	['Swiss grid', 'Strict grid, neo-grotesk type, red accent', '#ff3b30', '#f5f5f5'],
	['Retro print', 'Halftones, off-white stock, ink colors', '#f4efe6', '#2b59c3'],
	['Glass aurora', 'Frosted glass over aurora gradients', '#5ee7df', '#b490ca'],
	['Terminal mono', 'Monospace, green on black, typing', '#00ff66', '#000000'],
	['Sunset gradient', 'Orange-pink gradients, warm light', '#ff7e5f', '#feb47b'],
	['Paper craft', 'Cut-paper layers with soft shadows', '#ffe3b3', '#f28c28'],
	['Blueprint', 'Blue grid, white line drawings', '#1f4fd1', '#ffffff'],
];

// The DESIGN.md picker: create options on top, style presets below.
const DesignPanel: React.FC<{cursor: {x: number; y: number}}> = ({cursor}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const theme = useTheme();
	const p = openClose(frame, fps, T.designClick + 2);
	if (p <= 0.001) return null;

	const {scroll} = keyframes(
		frame,
		[
			{frame: 196, scroll: 0},
			{frame: 236, scroll: -560},
			{frame: 238, scroll: -560},
			{frame: 252, scroll: 0},
		],
		['scroll'],
	);
	const label = (text: string) => (
		<div style={{height: LABEL_H, display: 'flex', alignItems: 'flex-end', paddingBottom: 8, fontSize: 13, letterSpacing: '0.08em', color: theme.muted, fontWeight: 600}}>
			{text}
		</div>
	);

	return (
		<div
			style={{
				position: 'absolute',
				left: PANEL.left,
				top: PANEL.top,
				width: PANEL.width,
				height: PANEL.height,
				borderRadius: 16,
				background: '#18181d',
				border: `1px solid ${theme.border}`,
				boxShadow: '0 30px 60px rgba(0,0,0,0.55)',
				overflow: 'hidden',
				fontFamily: theme.fontFamily,
				opacity: p,
				transform: `translateY(${(1 - p) * -12}px)`,
			}}
		>
			<div style={{padding: PANEL_PAD, transform: `translateY(${scroll}px)`}}>
				<div style={{height: HEADER_H}}>
					<div style={{color: theme.fg, fontSize: 20, fontWeight: 600}}>Design styles</div>
					<div style={{color: theme.muted, fontSize: 15, marginTop: 6, lineHeight: 1.4}}>
						Kinetiq builds a style guide from your website if you leave this blank.
					</div>
				</div>
				{label('CREATE NEW')}
				{['Import from website', 'Upload DESIGN.md', 'Paste DESIGN.md'].map((t) => (
					<div key={t} style={{height: CREATE_H, display: 'flex', alignItems: 'center', gap: 12, color: theme.fg, fontSize: 17}}>
						<FileIcon />
						{t}
					</div>
				))}
				{label('PRESETS')}
				{PRESETS.map(([name, desc, c1, c2], i) => {
					const rowTop = PRESET_Y0 + i * PRESET_H + scroll;
					const hovered = cursor.y > rowTop && cursor.y < rowTop + PRESET_H && cursor.x > PANEL.left && cursor.x < PANEL.left + PANEL.width;
					const chosen = i === 0 && frame >= T.presetClick;
					return (
						<div
							key={name}
							style={{
								height: PRESET_H,
								display: 'flex',
								alignItems: 'center',
								gap: 14,
								padding: '0 10px',
								margin: '0 -10px',
								borderRadius: 10,
								background: hovered || chosen ? 'rgba(255,255,255,0.07)' : 'transparent',
							}}
						>
							<div
								style={{
									width: 38,
									height: 38,
									borderRadius: 10,
									flexShrink: 0,
									background: `linear-gradient(135deg, ${c1} 0%, ${c1} 50%, ${c2} 50%, ${c2} 100%)`,
									border: '1px solid rgba(255,255,255,0.15)',
								}}
							/>
							<div style={{flex: 1, minWidth: 0}}>
								<div style={{color: theme.fg, fontSize: 17, fontWeight: 600}}>{name}</div>
								<div style={{color: theme.muted, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{desc}</div>
							</div>
							{chosen && (
								<svg width={18} height={18} viewBox="0 0 16 16" fill="none" stroke="#b3a3ff" strokeWidth={2}>
									<path d="M3 8.5l3.2 3L13 4.5" />
								</svg>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
};

const RatioIcon: React.FC<{w: number; h: number}> = ({w, h}) => (
	<svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.6}>
		<rect x={9 - w / 2} y={9 - h / 2} width={w} height={h} rx={2} />
	</svg>
);

const ClockIcon: React.FC = () => (
	<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
		<circle cx={12} cy={12} r={9} />
		<path d="M12 7v5l3 2" />
	</svg>
);

const FileIcon: React.FC = () => (
	<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
		<path d="M6 3h8l4 4v14H6z" />
		<path d="M9 13h6M9 17h6" />
	</svg>
);
