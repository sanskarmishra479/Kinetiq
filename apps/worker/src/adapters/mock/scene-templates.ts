import type {ResearchResult, SceneBrief} from '@kinetiq/shared';

// The scene code the mock model "writes" (Phase 8). These are real, validated
// scenes: the renderer turns them into the actual video, so the whole pipeline
// is exercised for free. In Phase 9 the model writes code in this same shape,
// and these stay as the fallback when it fails.
//
// Text is passed as props, not baked into the code, so the same scene can be
// re-rendered with different copy without touching the sandboxed code.

const HOOK = `import {AbsoluteFill} from 'remotion';
import {Background, BlurInText} from '@kinetiq/primitives';

type Props = {title: string; subtitle: string};

export default function HookScene({title, subtitle}: Props) {
	return (
		<Background glow>
			<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', padding: 120}}>
				<BlurInText text={title} fontSize={104} weight={700} align="center" maxWidth={1500} />
				{subtitle ? (
					<BlurInText text={subtitle} at={16} fontSize={40} weight={500} align="center" maxWidth={1200} />
				) : null}
			</AbsoluteFill>
		</Background>
	);
}
`;

const STATEMENT = `import {AbsoluteFill, useVideoConfig} from 'remotion';
import {Background, BlurInText} from '@kinetiq/primitives';

type Props = {headline: string; detail: string};

export default function StatementScene({headline, detail}: Props) {
	const {width} = useVideoConfig();
	return (
		<Background>
			<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', gap: 32, padding: 140}}>
				<BlurInText text={headline} by="word" fontSize={Math.round(width / 22)} weight={700} align="center" maxWidth={width * 0.78} />
				{detail ? (
					<BlurInText text={detail} by="word" at={14} fontSize={Math.round(width / 52)} weight={500} align="center" maxWidth={width * 0.6} />
				) : null}
			</AbsoluteFill>
		</Background>
	);
}
`;

const CARDS = `import {AbsoluteFill} from 'remotion';
import {Background, BlurInText, CardGrid} from '@kinetiq/primitives';

type Props = {heading: string; cards: {title: string; body: string}[]; variant: 'grid' | 'list'};

export default function CardsScene({heading, cards, variant}: Props) {
	return (
		<Background>
			<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', gap: 56, padding: 100}}>
				<BlurInText text={heading} fontSize={64} weight={600} align="center" maxWidth={1400} />
				<CardGrid cards={cards} variant={variant} at={14} />
			</AbsoluteFill>
		</Background>
	);
}
`;

const DEMO = `import {AbsoluteFill, useVideoConfig} from 'remotion';
import {Background, Browser, useTheme} from '@kinetiq/primitives';

type Props = {url: string; headline: string; subline: string; cta: string; screenshot: string | null};

export default function DemoScene({url, headline, subline, cta, screenshot}: Props) {
	const {width, height} = useVideoConfig();
	const theme = useTheme();
	const frameWidth = Math.round(width * 0.82);
	const frameHeight = Math.round(height * 0.66);
	return (
		<Background>
			<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', paddingBottom: Math.round(height * 0.1)}}>
				<Browser
					url={url}
					width={frameWidth}
					height={frameHeight}
					typeAt={8}
					contentHeight={frameHeight}
					src={screenshot === null ? undefined : screenshot}
				>
					{screenshot === null ? (
						<AbsoluteFill
							style={{
								alignItems: 'center',
								justifyContent: 'center',
								gap: 28,
								padding: 80,
								textAlign: 'center',
								background: theme.surface,
							}}
						>
							<div style={{fontSize: 56, fontWeight: 700, color: theme.fg, fontFamily: theme.fontFamily}}>
								{headline}
							</div>
							<div style={{fontSize: 26, color: theme.muted, maxWidth: 720, fontFamily: theme.fontFamily}}>
								{subline}
							</div>
							<div
								style={{
									marginTop: 12,
									padding: '14px 28px',
									borderRadius: theme.radius,
									background: theme.accent,
									color: theme.accentFg,
									fontSize: 24,
									fontWeight: 600,
									fontFamily: theme.fontFamily,
								}}
							>
								{cta}
							</div>
						</AbsoluteFill>
					) : null}
				</Browser>
			</AbsoluteFill>
		</Background>
	);
}
`;

const CTA = `import {AbsoluteFill} from 'remotion';
import {Background, BlurInText, useTheme} from '@kinetiq/primitives';

type Props = {headline: string; domain: string};

export default function CtaScene({headline, domain}: Props) {
	const theme = useTheme();
	return (
		<Background glow>
			<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', gap: 40, padding: 120}}>
				<BlurInText text={headline} fontSize={88} weight={700} align="center" maxWidth={1400} />
				<div
					style={{
						padding: '18px 36px',
						borderRadius: theme.radius,
						border: '1px solid ' + theme.border,
						background: theme.surface,
						color: theme.fg,
						fontSize: 34,
						fontFamily: theme.fontFamily,
					}}
				>
					{domain}
				</div>
			</AbsoluteFill>
		</Background>
	);
}
`;

const LOGO = `import {AbsoluteFill} from 'remotion';
import {Background, LogoReveal} from '@kinetiq/primitives';

type Props = {name: string; tagline: string};

export default function LogoScene({name, tagline}: Props) {
	return (
		<Background glow>
			<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
				<LogoReveal name={name} tagline={tagline} />
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
				cards: research.features.slice(0, 3).map((f) => ({title: f.title, body: f.description})),
			};
		case 'demo':
			return {
				url: research.url,
				headline: first,
				// Never repeat the headline as the subline.
				subline: clip([second, research.description, research.tagline].find((t) => t && t !== first) ?? '', 110),
				cta: `Try ${research.productName}`,
				screenshot: null,
			};
		case 'cta':
			return {headline: first, domain: domainOf(research.url)};
		case 'logo':
			return {name: research.productName, tagline: research.tagline};
	}
}
