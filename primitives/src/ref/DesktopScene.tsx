import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {openClose, springs} from '../motion';
import {darkCinematic, ThemeProvider} from '../theme';
import {Camera} from '../primitives/Camera';
import {ChatBubble} from '../primitives/ChatBubble';
import {Dock, MenuBar, Wallpaper} from '../primitives/Desktop';
import {Notification} from '../primitives/Notification';
import {Window} from '../primitives/Window';

export const DESKTOP_SCENE = 170;

const font = darkCinematic.fontFamily;
const ink = '#0f1419';
const grey = '#536471';

// The camera tours the desktop, pulls back, then snaps to the notification.
const SHOTS = [
	{frame: 0, x: 430, y: 470, scale: 2.3},
	{frame: 34, x: 920, y: 520, scale: 2.3},
	{frame: 56, x: 1440, y: 440, scale: 2.2},
	{frame: 76, x: 960, y: 560, scale: 1.04},
	{frame: 100, x: 960, y: 560, scale: 1.04},
	{frame: 114, x: 1560, y: 170, scale: 2.5},
	{frame: 148, x: 1530, y: 185, scale: 2.42},
	{frame: 164, x: 960, y: 540, scale: 1},
];

export const DesktopScene: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const browser = openClose(frame, fps, 150, Infinity, springs.snappy);

	return (
		<AbsoluteFill style={{background: '#050507'}}>
			<Camera shots={SHOTS}>
				<AbsoluteFill style={{borderRadius: 28, overflow: 'hidden'}}>
					<Wallpaper />
					<MenuBar clock="Tue Sep 23  16:00" />
					<LaunchPost />
					<ThemeProvider value={{...darkCinematic, accent: '#0a84ff'}}>
						<div style={{position: 'absolute', left: 720, top: 250}}>
							<Window variant="mac" title="Mom" width={400} height={480}>
								<AbsoluteFill style={{background: '#000', justifyContent: 'flex-end', padding: 18, gap: 12}}>
									<ChatBubble fontSize={18} from="me" delay={14} text="Mom I hit 500k views across both the platforms!!" />
									<ChatBubble fontSize={18} from="them" delay={30} text="I'm so proud of you!" />
								</AbsoluteFill>
							</Window>
						</div>
					</ThemeProvider>
					<VideoPost />
					<Dock />
					<Notification
						app="Messages"
						title="Client:"
						body="Launch is in 5 mins! Where is the video?!"
						at={106}
						style={{right: 18, top: 48}}
					/>
				</AbsoluteFill>
			</Camera>
			{browser > 0.001 && (
				<AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
					<ThemeProvider value={darkCinematic}>
						<Window
							variant="mac"
							width={1560}
							height={900}
							style={{transform: `scale(${0.25 + browser * 0.75})`, opacity: Math.min(1, browser * 3)}}
						>
							<AbsoluteFill style={{background: '#0b0b10'}} />
						</Window>
					</ThemeProvider>
				</AbsoluteFill>
			)}
		</AbsoluteFill>
	);
};

const Avatar: React.FC<{size: number}> = ({size}) => (
	<div
		style={{
			width: size,
			height: size,
			borderRadius: size / 2,
			flexShrink: 0,
			background: 'linear-gradient(135deg, #7c5cff, #ff6ec7)',
			color: '#fff',
			fontWeight: 800,
			fontSize: size * 0.5,
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
		}}
	>
		K
	</div>
);

// A pinned social post announcing the launch, with an embedded product clip.
const LaunchPost: React.FC = () => (
	<div
		style={{
			position: 'absolute',
			left: 100,
			top: 110,
			width: 580,
			height: 610,
			background: '#fff',
			borderRadius: 16,
			padding: 26,
			fontFamily: font,
			color: ink,
			boxShadow: '0 30px 60px rgba(0,0,0,0.3)',
		}}
	>
		<div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
			<Avatar size={44} />
			<div>
				<div style={{fontWeight: 700, fontSize: 17}}>Kinetiq</div>
				<div style={{color: grey, fontSize: 15}}>@kinetiq_so · Pinned</div>
			</div>
		</div>
		<div style={{fontSize: 17, lineHeight: 1.5, marginTop: 14}}>
			Introducing <span style={{color: '#1d9bf0'}}>Kinetiq</span>: URL to video.
			<br />
			comment "KINETIQ" to get early access.
			<br />
			here's how it works + examples (thread):
		</div>
		<div
			style={{
				marginTop: 16,
				height: 310,
				borderRadius: 14,
				border: '1px solid #e6e9eb',
				background: '#f7f9f9',
				position: 'relative',
				overflow: 'hidden',
			}}
		>
			<div style={{position: 'absolute', left: 40, top: 110, display: 'grid', gridTemplateColumns: '14px 14px', gap: 6}}>
				{['#111', '#e0505f', '#111', '#111'].map((c, i) => (
					<div key={i} style={{width: 14, height: 14, borderRadius: 4, background: c}} />
				))}
			</div>
			<div style={{position: 'absolute', left: 84, top: 124, width: 90, height: 2, background: '#bbb'}} />
			<div
				style={{
					position: 'absolute',
					left: 170,
					top: 26,
					width: 240,
					height: 250,
					borderRadius: 14,
					background: '#16161a',
					padding: 18,
				}}
			>
				<div style={{color: '#fff', fontWeight: 600, fontSize: 15, marginBottom: 16}}>Build</div>
				{[
					['Visuals', '#3aa59a', '#fff'],
					['Motion', '#d9505f', '#fff'],
					['Sound', '#fff', '#111'],
				].map(([label, bg, fg]) => (
					<div
						key={label}
						style={{
							height: 40,
							borderRadius: 6,
							background: bg,
							color: fg,
							fontSize: 13,
							fontWeight: 600,
							display: 'flex',
							alignItems: 'center',
							paddingLeft: 12,
							marginBottom: 12,
						}}
					>
						{label}
					</div>
				))}
			</div>
			<div
				style={{
					position: 'absolute',
					left: 14,
					bottom: 12,
					background: 'rgba(0,0,0,0.7)',
					color: '#fff',
					fontSize: 13,
					padding: '2px 8px',
					borderRadius: 4,
				}}
			>
				1:36
			</div>
		</div>
		<div style={{display: 'flex', justifyContent: 'space-between', color: grey, fontSize: 15, marginTop: 16, padding: '0 8px'}}>
			<Stat d="M4 5h16v11H9l-5 4V5z" value="826" />
			<Stat d="M7 7h11v6M17 17H6v-6M15 4l3 3-3 3M9 20l-3-3 3-3" value="141" />
			<Stat d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" value="1.4K" color="#f91880" fill />
			<Stat d="M6 20V10M12 20V4M18 20v-7" value="207K" />
		</div>
	</div>
);

// A feed post with the launch video embedded ("I am Kinetiq.").
const VideoPost: React.FC = () => (
	<div
		style={{
			position: 'absolute',
			left: 1160,
			top: 120,
			width: 680,
			height: 630,
			background: '#fff',
			borderRadius: 14,
			overflow: 'hidden',
			fontFamily: font,
			color: ink,
			boxShadow: '0 30px 60px rgba(0,0,0,0.3)',
		}}
	>
		<div style={{padding: 22}}>
			<div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
				<Avatar size={50} />
				<div>
					<div style={{fontWeight: 700, fontSize: 17}}>Kinetiq team · 1st</div>
					<div style={{color: grey, fontSize: 14}}>Building video agents at kinetiq.so</div>
				</div>
			</div>
			<div style={{fontSize: 16, lineHeight: 1.5, marginTop: 14}}>
				Introducing <span style={{color: '#0a66c2', fontWeight: 600}}>Kinetiq</span>, a video agent for launch videos.
				<br />
				This launch video was made entirely with Kinetiq. <span style={{color: grey}}>…more</span>
			</div>
		</div>
		<div style={{height: 380, background: '#000', position: 'relative'}}>
			<AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', color: '#fff', fontSize: 56, fontWeight: 700, letterSpacing: '-0.02em'}}>
				I am Kinetiq.
			</AbsoluteFill>
			<div
				style={{
					position: 'absolute',
					left: 20,
					right: 20,
					bottom: 16,
					display: 'flex',
					alignItems: 'center',
					gap: 16,
					color: '#fff',
					fontSize: 14,
				}}
			>
				<svg width={16} height={16} viewBox="0 0 16 16" fill="#fff">
					<path d="M3 2l11 6-11 6z" />
				</svg>
				<div style={{flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.35)'}}>
					<div style={{width: '8%', height: 3, background: '#fff'}} />
				</div>
				<span>2:04</span>
				<span>1x</span>
			</div>
		</div>
		<div style={{display: 'flex', justifyContent: 'space-between', padding: '14px 22px', color: grey, fontSize: 14}}>
			<span>You and 1,902 others</span>
			<span>3,157 comments · 54 reposts</span>
		</div>
	</div>
);

const Stat: React.FC<{d: string; value: string; color?: string; fill?: boolean}> = ({d, value, color = grey, fill}) => (
	<span style={{display: 'flex', alignItems: 'center', gap: 6, color}}>
		<svg width={18} height={18} viewBox="0 0 24 24" fill={fill ? color : 'none'} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
			<path d={d} />
		</svg>
		{value}
	</span>
);
