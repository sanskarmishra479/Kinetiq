import {Img, useCurrentFrame, useVideoConfig} from 'remotion';
import {isDark} from '../color';
import {ease, keyframes, tween} from '../motion';
import {useTheme} from '../theme';
import {
	browserLayout,
	chromeScale as autoScale,
	browserTimeline,
	type BrowserIcon,
	scrollThumb,
	splitUrl,
	typedChars,
} from './browserLayout';

export type ScrollKey = {frame: number; y: number};

type Props = {
	// Shown in the address bar. Protocol and "www." are hidden, the path is dimmed.
	url?: string;
	width: number;
	height: number;
	// 'auto' picks light or dark chrome from the theme background.
	appearance?: 'light' | 'dark' | 'auto';
	// If set: the address bar is empty, the URL types in from this frame, then the page loads.
	typeAt?: number;
	// Scroll the page: keyframes of scroll offset in px.
	scroll?: ScrollKey[];
	// Total page height in px, for the scrollbar. Defaults to 3 screens.
	contentHeight?: number;
	// A screenshot to show as the page (the "screenshot fallback"). Otherwise pass children.
	src?: string;
	// Chrome size multiplier; defaults to real Mac proportions for the window width.
	chromeScale?: number;
	style?: React.CSSProperties;
	children?: React.ReactNode;
};

export const browserChrome = {
	light: {
		toolbar: '#f6f6f6',
		divider: 'rgba(0,0,0,0.1)',
		field: 'rgba(0,0,0,0.018)',
		fieldBorder: 'rgba(0,0,0,0.14)',
		fieldFocus: '#ffffff',
		icon: '#6d6d72',
		text: '#1d1d1f',
		muted: '#8e8e93',
		page: '#ffffff',
		scrollbar: 'rgba(0,0,0,0.42)',
		outline: '0 0 0 0.5px rgba(0,0,0,0.28)',
		highlight: 'rgba(255,255,255,0)',
	},
	dark: {
		toolbar: '#2c2c2e',
		divider: 'rgba(0,0,0,0.55)',
		field: 'rgba(255,255,255,0.07)',
		fieldBorder: 'rgba(255,255,255,0.08)',
		fieldFocus: 'rgba(255,255,255,0.1)',
		icon: '#a6a6ab',
		text: '#ececef',
		muted: '#8e8e93',
		page: '#1c1c1e',
		scrollbar: 'rgba(255,255,255,0.45)',
		outline: '0 0 0 1px rgba(0,0,0,0.7)',
		highlight: 'rgba(255,255,255,0.2)',
	},
};

const LIGHTS: [fill: string, ring: string][] = [
	['#ff5f57', '#e0443e'],
	['#febc2e', '#d9a02a'],
	['#28c840', '#1aab29'],
];

// A macOS-style browser window with a real address bar. Put a rebuilt page
// (children) or a screenshot (src) inside; it can type its URL, load, and scroll.
export const Browser: React.FC<Props> = ({
	url = 'website.com',
	width,
	height,
	appearance = 'auto',
	typeAt,
	scroll,
	contentHeight,
	src,
	chromeScale,
	style,
	children,
}) => {
	const frame = useCurrentFrame();
	const {fps, width: videoW, height: videoH} = useVideoConfig();
	const theme = useTheme();
	const mode = appearance === 'auto' ? (isDark(theme.bg) ? 'dark' : 'light') : appearance;
	const c = browserChrome[mode];
	const L = browserLayout(width, chromeScale ?? autoScale(width, Math.min(videoW, videoH)));
	const s = L.scale;

	// Intro: empty bar → typing → loading → page revealed.
	const {domain, path} = splitUrl(url);
	const shown = domain + path;
	const tl = typeAt === undefined ? null : browserTimeline(shown, typeAt, fps);
	const phase = !tl
		? 'idle'
		: frame < tl.typeStart
			? 'empty'
			: frame < tl.loadStart
				? 'typing'
				: frame < tl.loadEnd
					? 'loading'
					: 'idle';
	const reveal = tl ? tween(frame, [tl.loadEnd, tl.revealEnd], [0, 1]) : 1;
	const progress = tl ? tween(frame, [tl.loadStart, tl.loadEnd], [0, 1], ease.inOut) : 1;
	const progressFade = tl ? tween(frame, [tl.loadEnd, tl.loadEnd + 6], [1, 0]) : 0;

	// Scrolling, with an overlay scrollbar that shows while moving.
	const viewport = height - L.toolbar;
	const scrollY = scroll?.length ? keyframes(frame, scroll, ['y']).y : 0;
	const barOpacity = scroll?.length ? scrollbarOpacity(frame, scroll) : 0;
	const thumb = scrollThumb(scrollY, viewport, contentHeight ?? viewport * 3);

	const fontSize = 13 * s;
	const focused = phase === 'typing';

	return (
		<div
			style={{
				width,
				height,
				position: 'relative',
				borderRadius: L.radius,
				overflow: 'hidden',
				background: c.page,
				fontFamily: theme.fontFamily,
				boxShadow: [
					c.outline,
					'0 2px 6px rgba(0,0,0,0.12)',
					'0 12px 28px rgba(0,0,0,0.16)',
					'0 40px 90px rgba(0,0,0,0.3)',
				].join(', '),
				...style,
			}}
		>
			{/* Toolbar */}
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					width,
					height: L.toolbar,
					background: c.toolbar,
					borderBottom: `${Math.max(1, s * 0.75)}px solid ${c.divider}`,
					boxSizing: 'border-box',
				}}
			>
				{L.lights.map((l, i) => {
					const [fill, ring] = LIGHTS[i] ?? LIGHTS[0]!;
					return (
						<div
							key={i}
							style={{
								position: 'absolute',
								left: l.x - l.d / 2,
								top: l.y - l.d / 2,
								width: l.d,
								height: l.d,
								borderRadius: '50%',
								background: fill,
								boxShadow: `inset 0 0 0 ${0.6 * s}px ${ring}`,
							}}
						/>
					);
				})}
				{L.icons.map((ic) => (
					<Icon
						key={ic.name}
						name={ic.name}
						x={ic.x}
						y={L.toolbar / 2}
						size={L.iconSize}
						color={c.icon}
						bg={c.toolbar}
					/>
				))}

				{/* Address field */}
				<div
					style={{
						position: 'absolute',
						left: L.field.x,
						top: L.field.y,
						width: L.field.w,
						height: L.field.h,
						borderRadius: L.field.r,
						background: focused ? c.fieldFocus : c.field,
						boxShadow: focused
							? `0 0 0 ${3 * s}px ${theme.accent}66, inset 0 0 0 ${s}px ${theme.accent}`
							: `inset 0 0 0 ${Math.max(0.75, 0.75 * s)}px ${c.fieldBorder}`,
						overflow: 'hidden',
						display: 'flex',
						alignItems: 'center',
						justifyContent: focused ? 'flex-start' : 'center',
						padding: `0 ${30 * s}px 0 ${10 * s}px`,
						boxSizing: 'border-box',
						fontSize,
						letterSpacing: '0.005em',
						whiteSpace: 'nowrap',
					}}
				>
					{phase === 'empty' && <span style={{color: c.muted}}>Search or enter website name</span>}
					{phase === 'typing' && tl && (
						<span style={{color: c.text}}>
							{shown.slice(0, typedChars(frame, shown, tl.typeStart, fps))}
							<span
								style={{
									display: 'inline-block',
									width: Math.max(1, 1.2 * s),
									height: fontSize * 1.2,
									marginLeft: s,
									verticalAlign: 'middle',
									background: theme.accent,
								}}
							/>
						</span>
					)}
					{(phase === 'idle' || phase === 'loading') && (
						<span style={{display: 'flex', alignItems: 'center', gap: 5 * s, minWidth: 0}}>
							<LockIcon size={11 * s} color={c.icon} />
							<span style={{color: c.text, overflow: 'hidden', textOverflow: 'ellipsis'}}>
								{domain}
								<span style={{color: c.muted}}>{path}</span>
							</span>
						</span>
					)}
					<ReloadIcon size={13 * s} color={c.icon} style={{position: 'absolute', right: 9 * s}} />
					{tl && progressFade > 0 && frame >= tl.loadStart && (
						<div
							style={{
								position: 'absolute',
								left: 0,
								bottom: 0,
								height: 2.5 * s,
								width: `${progress * 100}%`,
								background: theme.accent,
								opacity: progressFade,
							}}
						/>
					)}
				</div>
			</div>

			{/* Page */}
			<div style={{position: 'absolute', left: 0, top: L.toolbar, width, height: viewport, overflow: 'hidden'}}>
				<div
					style={{
						position: 'absolute',
						left: 0,
						top: 0,
						width,
						minHeight: viewport,
						transform: `translateY(${-scrollY + (1 - reveal) * 14 * s}px)`,
						opacity: reveal,
					}}
				>
					{src ? <Img src={src} style={{width: '100%', display: 'block'}} /> : children}
				</div>
				{barOpacity > 0 && thumb.size > 0 && (
					<div
						style={{
							position: 'absolute',
							right: 3 * s,
							top: thumb.top + 2 * s,
							width: 6 * s,
							height: thumb.size - 4 * s,
							borderRadius: 3 * s,
							background: c.scrollbar,
							opacity: barOpacity,
						}}
					/>
				)}
			</div>

			{/* Inner top highlight on dark windows, like real macOS glass edges */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					borderRadius: L.radius,
					boxShadow: `inset 0 0 0 ${Math.max(0.5, 0.5 * s)}px ${c.highlight}`,
					pointerEvents: 'none',
				}}
			/>
		</div>
	);
};

// Visible while the page is scrolling, fading out ~half a second after it stops.
function scrollbarOpacity(frame: number, scroll: ScrollKey[]) {
	const FADE = 15;
	for (let k = 0; k <= FADE; k++) {
		const a = keyframes(frame - k, scroll, ['y']).y;
		const b = keyframes(frame - k - 1, scroll, ['y']).y;
		if (Math.abs(a - b) > 0.3) return k < 5 ? 1 : 1 - (k - 5) / (FADE - 5);
	}
	return 0;
}

const Icon: React.FC<{name: BrowserIcon; x: number; y: number; size: number; color: string; bg: string}> = ({
	name,
	x,
	y,
	size,
	color,
	bg,
}) => {
	const small = name === 'chevron';
	const sz = small ? size * 0.7 : size;
	return (
		<svg
			width={sz}
			height={sz}
			viewBox="0 0 16 16"
			fill="none"
			stroke={color}
			strokeWidth={small ? 1.7 : 1.3}
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{position: 'absolute', left: x - sz / 2, top: y - sz / 2}}
		>
			{name === 'sidebar' && (
				<>
					<rect x={1.5} y={2.5} width={13} height={11} rx={2.2} />
					<path d="M6 2.5v11" />
					<path d="M3.2 5.2h1.2M3.2 7.2h1.2M3.2 9.2h1.2" strokeWidth={1} />
				</>
			)}
			{name === 'chevron' && <path d="M4.5 6.5 8 10l3.5-3.5" />}
			{name === 'back' && <path d="M10.2 2.5 4.8 8l5.4 5.5" strokeWidth={1.5} />}
			{name === 'forward' && <path d="M5.8 2.5 11.2 8l-5.4 5.5" strokeWidth={1.5} />}
			{name === 'shield' && (
				<>
					<path d="M8 1.6 13.2 3.5V8c0 3-2.2 5.3-5.2 6.5C5 13.3 2.8 11 2.8 8V3.5Z" />
					<path d="M8 1.6 2.8 3.5V8c0 3 2.2 5.3 5.2 6.5Z" fill={color} />
				</>
			)}
			{name === 'share' && <path d="M8 1.2v9M5 4.2l3-3 3 3M5.8 6.5H4.2v8.3h7.6V6.5h-1.6" />}
			{name === 'plus' && <path d="M8 2.2v11.6M2.2 8h11.6" />}
			{name === 'tabs' && (
				<>
					<rect x={5} y={1.8} width={9.2} height={9.2} rx={2} />
					<rect x={1.8} y={5} width={9.2} height={9.2} rx={2} fill={bg} />
				</>
			)}
		</svg>
	);
};

const LockIcon: React.FC<{size: number; color: string}> = ({size, color}) => (
	<svg width={size} height={size} viewBox="0 0 16 16" style={{flexShrink: 0}}>
		<path d="M5 7.2V5a3 3 0 0 1 6 0v2.2" fill="none" stroke={color} strokeWidth={1.8} />
		<rect x={3} y={7} width={10} height={8} rx={1.8} fill={color} />
	</svg>
);

const ReloadIcon: React.FC<{size: number; color: string; style?: React.CSSProperties}> = ({size, color, style}) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 16 16"
		fill="none"
		stroke={color}
		strokeWidth={1.4}
		strokeLinecap="round"
		strokeLinejoin="round"
		style={style}
	>
		<path d="M13 8.5A5 5 0 1 1 11.3 4.3" />
		<path d="M11.8 1.6v3.1H8.7" />
	</svg>
);
