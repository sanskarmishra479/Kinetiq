import {AbsoluteFill, Sequence, useVideoConfig} from 'remotion';
import {darkCinematic, minimalLight, ThemeProvider} from '../theme';
import {Background} from '../primitives/Background';
import {BlurInText} from '../primitives/BlurInText';
import {Browser} from '../primitives/Browser';
import {type Card, CardGrid} from '../primitives/CardGrid';
import {FocusPull} from '../primitives/FocusPull';
import {Spotlight} from '../primitives/Spotlight';
import {ZoomFocus} from '../primitives/ZoomFocus';
import {SiteMock} from './BrowserDemo';

// Spotlight → ZoomFocus → CardGrid, joined by focus pulls.
const A = {from: 0, len: 165};
const B = {from: 150, len: 150};
const C = {from: 285, len: 150};
export const PRODUCT_FOCUS_DURATION = C.from + C.len;

// Browser placement (same as BrowserDemo) and element rects, in frame pixels.
const WIN = {left: 140, top: 80, width: 1640, height: 920};
const INPUT = {x: 600, y: 607, w: 720, h: 68};
const CTA = {x: 1567, y: 158, w: 117, h: 39};
const GALLERY_SCROLL = 520;
const CARD = {x: 237, y: 300, w: 465, h: 324};

const Site: React.FC<{scroll?: number}> = ({scroll = 0}) => (
	<div style={{position: 'absolute', left: WIN.left, top: WIN.top}}>
		<Browser url="kinetiq.so" width={WIN.width} height={WIN.height} scroll={[{frame: 0, y: scroll}]}>
			<SiteMock width={WIN.width} />
		</Browser>
	</div>
);

// 1. Spotlight: highlight the URL box with a label, then glide to the CTA button.
const SpotlightBeat: React.FC = () => (
	<ThemeProvider value={minimalLight}>
		<Background>
			<FocusPull inAt={-30} outAt={A.len - 16} duration={16}>
				<Site />
				<Spotlight rect={INPUT} at={20} until={80} label="Paste any URL" />
				<Spotlight
					rect={[
						{frame: 84, ...INPUT},
						{frame: 104, ...CTA},
					]}
					at={84}
					until={140}
					radius={12}
				/>
			</FocusPull>
		</Background>
	</ThemeProvider>
);

// 2. ZoomFocus: the camera pushes onto one gallery card while the page blurs.
const ZoomBeat: React.FC = () => (
	<ThemeProvider value={minimalLight}>
		<Background>
			<FocusPull inAt={0} outAt={B.len - 16} duration={16}>
				<ZoomFocus rect={CARD} at={20} until={105}>
					<Site scroll={GALLERY_SCROLL} />
				</ZoomFocus>
			</FocusPull>
		</Background>
	</ThemeProvider>
);

const FEATURES: Card[] = [
	{icon: 'globe', title: 'Any URL', body: 'We read your site, colors and fonts.'},
	{icon: 'wand', title: 'Designed for you', body: 'Motion, type and layout from your brand.'},
	{icon: 'video', title: 'Launch-ready', body: '16:9, 9:16 and 1:1 in one go.'},
	{icon: 'bolt', title: 'Minutes, not weeks', body: 'First cut before your coffee cools.'},
	{icon: 'layers', title: 'Edit by chat', body: 'Only the changed scenes re-render.'},
	{icon: 'shield', title: 'Yours to keep', body: 'Download the MP4, no watermark.'},
];

// 3. CardGrid: heading blurs in, then feature cards pop in diagonal waves.
export const CardGridBeat: React.FC = () => {
	const {width, height} = useVideoConfig();
	const k = Math.min(width, height) / 1080;
	return (
		<ThemeProvider value={darkCinematic}>
			<Background>
				<FocusPull inAt={0} duration={16}>
					<AbsoluteFill style={{justifyContent: 'center', gap: 56 * k}}>
						<BlurInText text="Everything you need to launch." at={6} fontSize={68 * k} />
						<CardGrid cards={FEATURES} at={26} />
					</AbsoluteFill>
				</FocusPull>
			</Background>
		</ThemeProvider>
	);
};

export const ProductFocusDemo: React.FC = () => (
	<AbsoluteFill style={{background: '#000'}}>
		<Sequence from={A.from} durationInFrames={A.len}>
			<SpotlightBeat />
		</Sequence>
		<Sequence from={B.from} durationInFrames={B.len}>
			<ZoomBeat />
		</Sequence>
		<Sequence from={C.from} durationInFrames={C.len}>
			<CardGridBeat />
		</Sequence>
	</AbsoluteFill>
);

export const CARD_GRID_VERTICAL_DURATION = C.len;
