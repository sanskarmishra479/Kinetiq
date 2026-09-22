import {loadFont as loadBricolage} from '@remotion/google-fonts/BricolageGrotesque';
import {loadFont as loadFraunces} from '@remotion/google-fonts/Fraunces';
import {loadFont as loadPlexMono} from '@remotion/google-fonts/IBMPlexMono';
import {loadFont as loadManrope} from '@remotion/google-fonts/Manrope';
import {AbsoluteFill, Sequence, useVideoConfig} from 'remotion';
import {minimalLight, resolveStyle, type Theme, ThemeProvider} from '../theme';
import {BlurInText} from '../primitives/BlurInText';
import {type Card, CardGrid} from '../primitives/CardGrid';
import type {CardVariant} from '../primitives/cardStyle';
import {FocusPull} from '../primitives/FocusPull';

// The same "features" beat for four made-up brands. Proof that CardGrid takes
// its look from the brand (theme style + variant), not from one template.

const latin = {subsets: ['latin' as const]};
const manrope = loadManrope('normal', {weights: ['500', '700', '800'], ...latin}).fontFamily;
const plexMono = loadPlexMono('normal', {weights: ['500'], ...latin}).fontFamily;
const fraunces = loadFraunces('normal', {weights: ['500'], ...latin}).fontFamily;
const bricolage = loadBricolage('normal', {weights: ['800'], ...latin}).fontFamily;

type Brand = {name: string; theme: Theme; variant: CardVariant; heading: string; cards: Card[]};

const BRANDS: Brand[] = [
	{
		name: 'Ledgerly',
		variant: 'bento',
		heading: 'Get paid without chasing anyone.',
		theme: {
			...minimalLight,
			bg: '#eef3f0',
			surface: '#ffffff',
			fg: '#10231b',
			muted: '#5b6f66',
			border: 'rgba(16,35,27,0.1)',
			accent: '#1b6e48',
			accentFg: '#ffffff',
			radius: 26,
			fontFamily: manrope,
			palette: ['#1b6e48'],
			style: {surface: 'solid', border: 'none', shadow: 'soft', headingWeight: 800, headingTracking: -0.035},
		},
		cards: [
			{icon: 'bolt', title: 'Invoice in one click', body: 'Turn tracked hours into a clean invoice, ready to send.'},
			{icon: 'clock', title: 'Polite reminders', body: 'Sent for you, on schedule.'},
			{icon: 'globe', title: '40+ currencies', body: 'Clients pay the way they like.'},
			{icon: 'shield', title: 'Tax set aside', body: 'A share of each payment, saved.'},
			{icon: 'users', title: 'Client portal', body: 'Every invoice in one link.'},
			{icon: 'chart', title: 'Cash-flow view', body: 'See next month before it comes.'},
		],
	},
	{
		name: 'Tracebit',
		variant: 'list',
		heading: 'Find the bug before your users do.',
		theme: {
			bg: '#0c1424',
			surface: '#111c31',
			surfaceAlt: '#16233c',
			fg: '#e3e9f5',
			muted: '#8392b0',
			border: 'rgba(227,233,245,0.12)',
			accent: '#5b8cff',
			accentFg: '#ffffff',
			radius: 2,
			fontFamily: minimalLight.fontFamily,
			headingFont: plexMono,
			style: {surface: 'outline', border: 'hairline', shadow: 'none', headingWeight: 500, headingTracking: -0.02},
		},
		cards: [
			{title: 'Search a billion lines', body: 'Results in about 200 ms, across every service.'},
			{title: 'Errors grouped for you', body: 'One entry per real problem, not ten thousand.'},
			{title: 'Replay the request', body: 'See the exact inputs that broke production.'},
			{title: 'Alerts that mean it', body: 'Page someone only when users are affected.'},
		],
	},
	{
		name: 'Margins',
		variant: 'steps',
		heading: 'From first draft to paid readers.',
		theme: {
			bg: '#eaeef4',
			surface: '#ffffff',
			surfaceAlt: '#f4f6f9',
			fg: '#1c2130',
			muted: '#5d6475',
			border: 'rgba(28,33,48,0.12)',
			accent: '#6d2b58',
			accentFg: '#ffffff',
			radius: 6,
			fontFamily: minimalLight.fontFamily,
			headingFont: fraunces,
			palette: ['#6d2b58', '#1f6f78', '#6d2b58', '#1f6f78'],
			style: {surface: 'outline', border: 'none', shadow: 'none', headingWeight: 500, headingTracking: -0.01},
		},
		cards: [
			{title: 'Draft', body: 'A quiet editor that saves every version.'},
			{title: 'Edit', body: 'Comments from your editor, right in the text.'},
			{title: 'Publish', body: 'Web and email in one step.'},
			{title: 'Grow', body: 'Paid subscriptions when you are ready.'},
		],
	},
	{
		name: 'Loopy',
		variant: 'bento',
		heading: 'Tiny videos with your people.',
		theme: {
			...minimalLight,
			bg: '#ffffff',
			surface: '#ffffff',
			fg: '#15131a',
			muted: '#4a4656',
			border: 'rgba(21,19,26,0.12)',
			accent: '#6a3cff',
			accentFg: '#ffffff',
			radius: 28,
			fontFamily: minimalLight.fontFamily,
			headingFont: bricolage,
			palette: ['#6a3cff', '#ff5ca8', '#ffd23f', '#1ed3b0'],
			style: {surface: 'brand', border: 'bold', shadow: 'hard', headingWeight: 800, headingTracking: -0.03},
		},
		cards: [
			{icon: 'video', title: 'Six seconds, no pressure', body: 'Record, react, move on.'},
			{icon: 'users', title: 'Just your crew', body: 'Groups up to 12.'},
			{icon: 'sparkle', title: 'Stickers that move', body: 'Draw on any clip.'},
			{icon: 'clock', title: 'Gone by Sunday', body: 'Loops fade each week.'},
			{icon: 'lock', title: 'Private by default', body: 'No public feed.'},
			{icon: 'bolt', title: 'Instant replies', body: 'Loop back in one tap.'},
		],
	},
];

const BEAT = 130;
const OVERLAP = 14;
export const BRAND_STYLES_DURATION = BRANDS.length * (BEAT - OVERLAP) + OVERLAP;

const BrandBeat: React.FC<{brand: Brand; first: boolean}> = ({brand, first}) => {
	const {width, height} = useVideoConfig();
	const k = Math.min(width, height) / 1080;
	const wide = width > height;
	const t = brand.theme;
	const s = resolveStyle(t);
	// Side margin in %, shared by the wordmark, heading and cards so their left edges line up.
	const side = wide ? 8 : 6;
	return (
		<ThemeProvider value={t}>
			<AbsoluteFill style={{background: t.bg}}>
				<FocusPull inAt={first ? -30 : 0} outAt={BEAT - OVERLAP} duration={OVERLAP}>
					<div
						style={{
							position: 'absolute',
							top: 56 * k,
							left: `${side}%`,
							fontFamily: s.headingFont,
							fontWeight: s.headingWeight,
							fontSize: 26 * k,
							color: t.fg,
						}}
					>
						{brand.name}
					</div>
					<AbsoluteFill style={{justifyContent: 'center'}}>
						<div
							style={{
								width: `${100 - side * 2}%`,
								margin: '0 auto',
								display: 'flex',
								flexDirection: 'column',
								gap: 44 * k,
							}}
						>
							<BlurInText
								text={brand.heading}
								at={4}
								align="left"
								maxWidth="100%"
								fontSize={(wide ? 64 : 76) * k}
								weight={s.headingWeight}
								style={{fontFamily: s.headingFont, letterSpacing: `${s.headingTracking}em`, margin: 0}}
							/>
							<CardGrid cards={brand.cards} variant={brand.variant} at={20} maxWidth="100%" />
						</div>
					</AbsoluteFill>
				</FocusPull>
			</AbsoluteFill>
		</ThemeProvider>
	);
};

export const BrandStylesDemo: React.FC = () => (
	<AbsoluteFill style={{background: '#000'}}>
		{BRANDS.map((brand, i) => (
			<Sequence key={brand.name} from={i * (BEAT - OVERLAP)} durationInFrames={BEAT}>
				<BrandBeat brand={brand} first={i === 0} />
			</Sequence>
		))}
	</AbsoluteFill>
);
