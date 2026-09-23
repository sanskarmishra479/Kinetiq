import type {ResearchResult, SceneBrief} from '@kinetiq/shared';

// The scene code the mock model "writes" (Phase 8). These are real, validated
// scenes: the renderer turns them into the actual video, so the whole pipeline
// is exercised for free. In Phase 9 the model writes code in this same shape,
// and these stay as the fallback when it fails.
//
// Text is passed as props, not baked into the code, so the same scene can be
// re-rendered with different copy without touching the sandboxed code.

// Motion rule for every template: something is always moving. The camera
// never locks off (slow pushes, pulls and pans), product scenes type, load,
// click and scroll, and text arrives in stages. Scenes receive their own length
// as `durationInFrames`, so the motion spans the whole scene.

const HOOK = `import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background, BlurInText, blurInEnd} from '@kinetiq/primitives';

type Props = {title: string; subtitle: string; durationInFrames: number; still: boolean};

// New information keeps arriving: words land at speaking pace (~2.6 words a second),
// finishing by 70% of the scene, instead of everything appearing in the first second.
function pace(text: string, from: number, durationInFrames: number) {
	const words = Math.max(1, text.split(' ').length);
	return Math.max(3, Math.min(11, Math.floor((durationInFrames * 0.7 - from) / words)));
}

export default function HookScene({title, subtitle, durationInFrames, still}: Props) {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const unit = Math.min(width, height);
	// A pull back at constant speed from the first frame to the last (camera locked when still).
	const move = still ? 0 : 1;
	const scale = interpolate(frame, [0, durationInFrames], [1 + 0.2 * move, 1]);
	const rise = interpolate(frame, [0, durationInFrames], [height * 0.03 * move, -height * 0.03 * move]);
	const titleEnd = blurInEnd(title.length, 0, 2, 12);
	const subtitleAt = titleEnd + 4;
	return (
		<Background glow>
			<AbsoluteFill style={{transform: 'translateY(' + rise + 'px) scale(' + scale + ')'}}>
				<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', gap: unit * 0.03, padding: unit * 0.1}}>
					<BlurInText text={title} by="letter" stagger={2} duration={12} fontSize={unit * 0.1} weight={700} align="center" maxWidth={width * 0.8} />
					{subtitle ? (
						<BlurInText
							text={subtitle}
							by="word"
							at={subtitleAt}
							stagger={pace(subtitle, subtitleAt, durationInFrames)}
							fontSize={unit * 0.036}
							weight={500}
							align="center"
							maxWidth={width * 0.62}
						/>
					) : null}
				</AbsoluteFill>
			</AbsoluteFill>
		</Background>
	);
}
`;

const STATEMENT = `import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background, BlurInText, blurInEnd, tween, useTheme} from '@kinetiq/primitives';

type Props = {headline: string; detail: string; durationInFrames: number; still: boolean};

// Words land at speaking pace across the scene, never all at once.
function pace(text: string, from: number, until: number) {
	const words = Math.max(1, text.split(' ').length);
	return Math.max(3, Math.min(11, Math.floor((until - from) / words)));
}

export default function StatementScene({headline, detail, durationInFrames, still}: Props) {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const theme = useTheme();
	const unit = Math.min(width, height);
	// A lateral pan with a gentle push, at constant speed for the whole scene (locked when still).
	const move = still ? 0 : 1;
	const pan = interpolate(frame, [0, durationInFrames], [width * 0.05 * move, -width * 0.05 * move]);
	const scale = interpolate(frame, [0, durationInFrames], [1 + 0.04 * move, 1 + 0.18 * move]);
	const words = Math.max(1, headline.split(' ').length);
	const headlineStagger = pace(headline, 4, durationInFrames * (detail ? 0.45 : 0.7));
	const headlineEnd = blurInEnd(words, 4, headlineStagger, 14);
	const detailAt = headlineEnd + 6;
	const underline = tween(frame, [headlineEnd - 6, headlineEnd + 18], [0, 1]);
	return (
		<Background>
			<AbsoluteFill style={{transform: 'translateX(' + pan + 'px) scale(' + scale + ')'}}>
				<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', gap: unit * 0.035, padding: unit * 0.12}}>
					<BlurInText
						text={headline}
						by="word"
						at={4}
						stagger={headlineStagger}
						duration={14}
						fontSize={unit * 0.068}
						weight={700}
						align="center"
						maxWidth={width * 0.74}
					/>
					<div style={{width: unit * 0.28 * underline, height: Math.max(3, unit * 0.005), borderRadius: 4, background: theme.accent}} />
					{detail ? (
						<BlurInText
							text={detail}
							by="word"
							at={detailAt}
							stagger={pace(detail, detailAt, durationInFrames * 0.8)}
							fontSize={unit * 0.032}
							weight={500}
							align="center"
							maxWidth={width * 0.56}
							color={theme.muted}
						/>
					) : null}
				</AbsoluteFill>
			</AbsoluteFill>
		</Background>
	);
}
`;

const CARDS = `import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background, BlurInText, Camera, CardGrid} from '@kinetiq/primitives';

type Card = {title: string; body: string; icon: 'bolt' | 'sparkle' | 'shield' | 'chart' | 'globe' | 'layers'};
type Props = {heading: string; cards: Card[]; variant: 'grid' | 'list'; durationInFrames: number; still: boolean};

export default function CardsScene({heading, cards, variant, durationInFrames, still}: Props) {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const unit = Math.min(width, height);
	// A deliberate move (close on the heading, pull back to the cards) on top of a constant drift.
	const move = still ? 0 : 1;
	const shots = [
		{frame: 0, x: width / 2, y: height * (0.5 - 0.16 * move), scale: 1 + 0.35 * move},
		{frame: Math.max(1, Math.round(durationInFrames * 0.35)), x: width / 2, y: height * 0.5, scale: 1},
	];
	const drift = interpolate(frame, [0, durationInFrames], [1, 1 + 0.1 * move]);
	const pan = interpolate(frame, [0, durationInFrames], [width * 0.02 * move, -width * 0.02 * move]);
	return (
		<Background>
			<AbsoluteFill style={{transform: 'translateX(' + pan + 'px) scale(' + drift + ')'}}>
			<Camera shots={shots}>
				<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', gap: unit * 0.05, padding: unit * 0.08}}>
					<BlurInText text={heading} by="word" fontSize={unit * 0.06} weight={700} align="center" maxWidth={width * 0.8} />
					<CardGrid cards={cards} variant={variant} at={16} stagger={5} />
				</AbsoluteFill>
			</Camera>
			</AbsoluteFill>
		</Background>
	);
}
`;

const DEMO = `import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {
	Background,
	Browser,
	Camera,
	Cursor,
	Lens,
	browserLayout,
	browserTimeline,
	chromeScale,
	isPressed,
	splitUrl,
	useTheme,
} from '@kinetiq/primitives';

type Feature = {title: string; body: string};
type Props = {
	url: string;
	headline: string;
	subline: string;
	cta: string;
	features: Feature[];
	screenshot: string | null;
	durationInFrames: number;
	still: boolean;
};

// Keyframes must move forward in time, however short the scene is.
function forward<T extends {frame: number}>(keys: T[]): T[] {
	let last = -1;
	return keys.map((key) => {
		const frame = Math.max(key.frame, last + 1);
		last = frame;
		return {...key, frame};
	});
}

export default function DemoScene({url, headline, subline, cta, features, screenshot, durationInFrames, still}: Props) {
	const frame = useCurrentFrame();
	const {width, height, fps} = useVideoConfig();
	const theme = useTheme();
	const unit = Math.min(width, height);

	// The browser window and its page, in frame pixels.
	const W = Math.round(width * 0.84);
	const H = Math.round(height * 0.82);
	const left = Math.round((width - W) / 2);
	const top = Math.round((height - H) / 2);
	const chrome = browserLayout(W, chromeScale(W, unit));
	const pageTop = top + chrome.toolbar;
	const pageHeight = H - chrome.toolbar;
	const button = {x: left + W / 2, y: pageTop + pageHeight * 0.62};
	const field = {x: left + chrome.field.x + chrome.field.w / 2, y: top + chrome.field.y + chrome.field.h / 2};

	// Beats: type the URL, the page loads, the cursor clicks the button, the page scrolls to the features.
	const parts = splitUrl(url);
	const timeline = browserTimeline(parts.domain + parts.path, 4, fps);
	const loaded = timeline.revealEnd;
	const rest = Math.max(30, durationInFrames - loaded);
	const clickAt = loaded + Math.round(rest * 0.35);
	const scrollStart = clickAt + Math.round(rest * 0.12);
	const scrollEnd = scrollStart + Math.round(rest * 0.3);
	const scrollTo = Math.round(pageHeight * 0.8);

	// The camera follows the action: close on the address bar, pull back, push onto the button,
	// follow the scroll. When the scene is meant to be still, it stays on the wide shot while the
	// page still types, loads, clicks and scrolls.
	const wide = [{frame: 0, x: width / 2, y: height / 2, scale: 1}];
	const shots = still ? wide : forward([
		{frame: 0, x: field.x, y: field.y + height * 0.05, scale: 2.1},
		{frame: timeline.typeEnd, x: field.x, y: field.y + height * 0.08, scale: 1.95},
		{frame: loaded, x: width / 2, y: height / 2, scale: 1.02},
		{frame: clickAt - 6, x: button.x, y: button.y, scale: 1.45},
		{frame: clickAt + 8, x: button.x, y: button.y - height * 0.01, scale: 1.52},
		{frame: scrollEnd, x: width / 2, y: height * 0.52, scale: 1.12},
		{frame: durationInFrames, x: width * 0.53, y: height * 0.5, scale: 1.2},
	]);
	const path = forward([
		{frame: loaded - 6, x: width * 0.86, y: height * 0.94},
		{frame: clickAt - 2, x: button.x, y: button.y},
		{frame: scrollStart, x: button.x + unit * 0.01, y: button.y + unit * 0.01},
		{frame: scrollEnd, x: left + W * 0.27, y: pageTop + pageHeight * 0.55},
		{frame: durationInFrames, x: left + W * 0.3, y: pageTop + pageHeight * 0.5},
	]);
	const pressed = isPressed(frame, [clickAt]);
	const k = W / 1600;

	const page = (
		<div style={{position: 'absolute', left: 0, top: 0, width: W, height: pageHeight * 2.2, background: theme.bg, fontFamily: theme.fontFamily}}>
			<div style={{position: 'absolute', left: 48 * k, right: 48 * k, top: 26 * k, display: 'flex', alignItems: 'center', gap: 32 * k}}>
				<div style={{width: 30 * k, height: 30 * k, borderRadius: 8 * k, background: theme.accent}} />
				<div style={{fontSize: 22 * k, fontWeight: 700, color: theme.fg}}>{parts.domain}</div>
				<div style={{flex: 1}} />
				<div style={{fontSize: 18 * k, color: theme.muted}}>Product</div>
				<div style={{fontSize: 18 * k, color: theme.muted}}>Pricing</div>
				<div style={{fontSize: 18 * k, color: theme.muted}}>Docs</div>
			</div>
			<div style={{position: 'absolute', left: W * 0.12, right: W * 0.12, top: pageHeight * 0.2, textAlign: 'center'}}>
				<div style={{fontSize: 64 * k, fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.02em', color: theme.fg}}>{headline}</div>
				<div style={{marginTop: 22 * k, fontSize: 24 * k, lineHeight: 1.45, color: theme.muted}}>{subline}</div>
			</div>
			<div
				style={{
					position: 'absolute',
					left: W / 2,
					top: pageHeight * 0.62,
					transform: 'translate(-50%, -50%) scale(' + (pressed ? 0.94 : 1) + ')',
					padding: 18 * k + 'px ' + 36 * k + 'px',
					borderRadius: theme.radius * k,
					background: theme.accent,
					color: theme.accentFg,
					fontSize: 24 * k,
					fontWeight: 700,
					boxShadow: '0 ' + 12 * k + 'px ' + 40 * k + 'px rgba(0,0,0,0.35)',
				}}
			>
				{cta}
			</div>
			<div style={{position: 'absolute', left: W * 0.08, right: W * 0.08, top: pageHeight * 1.02, display: 'flex', gap: 28 * k}}>
				{features.map((feature) => (
					<div
						key={feature.title}
						style={{flex: 1, padding: 32 * k, borderRadius: theme.radius * k, background: theme.surface, border: '1px solid ' + theme.border}}
					>
						<div style={{width: 40 * k, height: 40 * k, borderRadius: 10 * k, background: theme.accent, opacity: 0.9}} />
						<div style={{marginTop: 20 * k, fontSize: 26 * k, fontWeight: 700, color: theme.fg}}>{feature.title}</div>
						<div style={{marginTop: 10 * k, fontSize: 18 * k, lineHeight: 1.5, color: theme.muted}}>{feature.body}</div>
					</div>
				))}
			</div>
		</div>
	);

	return (
		<Lens strength={0.07} vignette={0.3}>
			<Background>
				<Camera shots={shots}>
					<div style={{position: 'absolute', left, top}}>
						<Browser
							url={url}
							width={W}
							height={H}
							typeAt={4}
							scroll={[
								{frame: scrollStart, y: 0},
								{frame: scrollEnd, y: scrollTo},
							]}
							contentHeight={pageHeight * 2.2}
							src={screenshot === null ? undefined : screenshot}
						>
							{screenshot === null ? page : null}
						</Browser>
					</div>
					<Cursor path={path} clicks={[clickAt]} hideBefore={loaded - 6} />
				</Camera>
			</Background>
		</Lens>
	);
}
`;

const CTA = `import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background, BlurInText, Camera, Cursor, isPressed, useTheme} from '@kinetiq/primitives';

type Props = {headline: string; domain: string; durationInFrames: number; still: boolean};

export default function CtaScene({headline, domain, durationInFrames, still}: Props) {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const theme = useTheme();
	const unit = Math.min(width, height);
	const button = {x: width / 2, y: height * 0.6};
	const clickAt = Math.round(durationInFrames * 0.55);
	// Push in toward the button while the cursor comes to click it (camera locked when still).
	const shots = still
		? [{frame: 0, x: width / 2, y: height / 2, scale: 1}]
		: [
				{frame: 0, x: width / 2, y: height * 0.48, scale: 1.02},
				{frame: durationInFrames, x: button.x, y: button.y - height * 0.04, scale: 1.2},
			];
	const path = [
		{frame: Math.round(durationInFrames * 0.2), x: width * 0.84, y: height * 0.95},
		{frame: clickAt - 2, x: button.x + unit * 0.04, y: button.y + unit * 0.01},
		{frame: durationInFrames, x: button.x + unit * 0.05, y: button.y + unit * 0.03},
	];
	const pressed = isPressed(frame, [clickAt]);
	return (
		<Background glow>
			<Camera shots={shots}>
				<AbsoluteFill style={{alignItems: 'center', paddingTop: height * 0.3}}>
					<BlurInText text={headline} by="word" fontSize={unit * 0.08} weight={700} align="center" maxWidth={width * 0.8} />
				</AbsoluteFill>
				<div
					style={{
						position: 'absolute',
						left: button.x,
						top: button.y,
						transform: 'translate(-50%, -50%) scale(' + (pressed ? 0.94 : 1) + ')',
						padding: unit * 0.02 + 'px ' + unit * 0.04 + 'px',
						borderRadius: theme.radius,
						background: theme.accent,
						color: theme.accentFg,
						fontSize: unit * 0.032,
						fontWeight: 700,
						fontFamily: theme.fontFamily,
					}}
				>
					{domain}
				</div>
				<Cursor path={path} clicks={[clickAt]} hideBefore={Math.round(durationInFrames * 0.2)} />
			</Camera>
		</Background>
	);
}
`;

const LOGO = `import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Background, BlurInText, LogoReveal, useTheme} from '@kinetiq/primitives';

type Props = {name: string; tagline: string; domain: string; durationInFrames: number; still: boolean};

export default function LogoScene({name, tagline, domain, durationInFrames, still}: Props) {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const theme = useTheme();
	const unit = Math.min(width, height);
	// A steady push in, a slow rise, and the address arriving late: the end card never sits still.
	const move = still ? 0 : 1;
	const scale = interpolate(frame, [0, durationInFrames], [1 - 0.04 * move, 1 + 0.22 * move]);
	const rise = interpolate(frame, [0, durationInFrames], [height * 0.02 * move, -height * 0.02 * move]);
	const domainAt = Math.max(24, Math.round(durationInFrames * 0.45));
	return (
		<Background glow>
			<AbsoluteFill style={{transform: 'translateY(' + rise + 'px) scale(' + scale + ')'}}>
				<LogoReveal name={name} tagline={tagline} />
				{/* LogoReveal centers itself in the frame; the address sits in the lower third, below the tagline. */}
				<AbsoluteFill style={{alignItems: 'center', justifyContent: 'flex-end', paddingBottom: height * 0.2}}>
					<div style={{padding: unit * 0.012 + 'px ' + unit * 0.03 + 'px', borderRadius: 999, border: '1px solid ' + theme.border}}>
						<BlurInText text={domain} by="letter" at={domainAt} stagger={2} fontSize={unit * 0.03} weight={600} color={theme.fg} />
					</div>
				</AbsoluteFill>
			</AbsoluteFill>
		</Background>
	);
}
`;

export const SCENE_TEMPLATES = {hook: HOOK, statement: STATEMENT, cards: CARDS, demo: DEMO, cta: CTA, logo: LOGO};
export type TemplateId = keyof typeof SCENE_TEMPLATES;

/** Which template fits a scene's purpose. */
export function templateFor(brief: SceneBrief): TemplateId {
	if (brief.usesProductUi) return 'demo';
	switch (brief.purpose) {
		case 'hook':
			return 'hook';
		case 'feature':
		case 'social_proof':
			return 'cards';
		case 'cta':
			return 'cta';
		case 'logo':
			return 'logo';
		default:
			return 'statement';
	}
}

const CARD_ICONS = ['bolt', 'sparkle', 'shield', 'chart', 'globe', 'layers'] as const;

/** Shortens text at a word boundary, never mid-word. */
export function clip(text: string, max: number): string {
	if (text.length <= max) return text;
	const cut = text.slice(0, max - 1);
	const space = cut.lastIndexOf(' ');
	return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[,.;:]$/, '')}…`;
}

const domainOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

/** The data a scene's code renders. Screenshots are filled in later if QA falls back. */
export function propsFor(brief: SceneBrief, research: ResearchResult, template: TemplateId): Record<string, unknown> {
	// Scenes move by default; a still scene locks its camera (the content can still animate).
	return {...contentFor(brief, research, template), still: brief.motion === 'still'};
}

function contentFor(brief: SceneBrief, research: ResearchResult, template: TemplateId): Record<string, unknown> {
	const [first = research.productName, second = ''] = brief.onScreenText;
	switch (template) {
		case 'hook':
			return {title: first, subtitle: second};
		case 'statement':
			return {headline: first, detail: second === first ? '' : second};
		case 'cards':
			return {
				heading: first,
				variant: brief.purpose === 'social_proof' ? 'list' : 'grid',
				cards: research.features
					.slice(0, 3)
					.map((f, i) => ({title: f.title, body: f.description, icon: CARD_ICONS[i % CARD_ICONS.length]!})),
			};
		case 'demo':
			return {
				url: research.url,
				// The page replicates their homepage, whose hero is the tagline.
				headline: research.tagline || first,
				// Never repeat the headline as the subline.
				subline: clip(
					[research.description, second, first].find((t) => t && t !== (research.tagline || first)) ?? '',
					110,
				),
				cta: `Try ${research.productName}`,
				features: research.features.slice(0, 3).map((f) => ({title: f.title, body: clip(f.description, 70)})),
				screenshot: null,
			};
		case 'cta':
			return {headline: first, domain: domainOf(research.url)};
		case 'logo':
			return {name: research.productName, tagline: research.tagline, domain: domainOf(research.url)};
	}
}
