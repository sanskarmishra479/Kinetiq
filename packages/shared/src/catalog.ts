import {z} from 'zod';
import {Credits, HexColor} from './common.js';

// Static product catalog: voices, design presets, video models, plans, credit
// costs. Served by the public /v1 catalog endpoints and used for pricing.
// ⚠ Prices and credit amounts are PLACEHOLDERS until pricing is decided
// (docs/TODO.md Phase 18). Change them here only.

// ── Design tokens (the code form of a DESIGN.md) ─────────────────────────────
// Mirrors the primitives' Theme (packages/primitives/src/theme.tsx).
const CssColor = z.union([
	HexColor,
	z
		.string()
		.regex(/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/, 'must be a color'),
]);

export const DesignTokens = z.strictObject({
	bg: CssColor,
	surface: CssColor,
	surfaceAlt: CssColor,
	border: CssColor,
	fg: CssColor,
	muted: CssColor,
	accent: CssColor,
	accentFg: CssColor,
	radius: z.int().min(0).max(48),
	fontFamily: z.string().min(1).max(80),
	motion: z.strictObject({
		pace: z.enum(['calm', 'medium', 'fast']),
		easing: z.enum(['soft', 'snappy', 'bouncy']),
	}),
});
export type DesignTokens = z.infer<typeof DesignTokens>;

// ── Voices (MVP: 5, English) ─────────────────────────────────────────────────
export const VOICE_IDS = ['sam', 'kira', 'leo', 'maya', 'arjun'] as const;
export const VoiceId = z.enum(VOICE_IDS);
export type VoiceId = z.infer<typeof VoiceId>;

export const LANGUAGES = ['en'] as const;
export const Language = z.enum(LANGUAGES);

export const Voice = z.object({
	id: VoiceId,
	name: z.string(),
	traits: z.string(),
	languages: z.array(Language).min(1),
	previewKey: z.string(),
});
export type Voice = z.infer<typeof Voice>;

export const VOICES: readonly Voice[] = [
	{id: 'sam', name: 'Sam', traits: 'confident, fast, male', languages: ['en'], previewKey: 'voices/sam.mp3'},
	{id: 'kira', name: 'Kira', traits: 'confident, female', languages: ['en'], previewKey: 'voices/kira.mp3'},
	{id: 'leo', name: 'Leo', traits: 'warm, calm, male', languages: ['en'], previewKey: 'voices/leo.mp3'},
	{id: 'maya', name: 'Maya', traits: 'friendly, upbeat, female', languages: ['en'], previewKey: 'voices/maya.mp3'},
	{
		id: 'arjun',
		name: 'Arjun',
		traits: 'clear, Indian English, male',
		languages: ['en'],
		previewKey: 'voices/arjun.mp3',
	},
];

/**
 * Our 5 voices mapped to each provider's voices (FR-AUD-01). Users only ever
 * see our names. Override per deployment with TTS_VOICES (e.g. for an
 * OpenRouter model whose voices differ, or a better Indian-English voice).
 * Check these in each provider's dashboard before launch: libraries change.
 */
export const PROVIDER_VOICES = {
	// ElevenLabs default library voices (voice ids).
	elevenlabs: {
		sam: 'TX3LPaxmHKxFdv7VOQHJ', // Liam: confident, energetic
		kira: 'EXAVITQu4vr4xnSDxMaL', // Sarah: confident, clear
		leo: 'nPczCjzI2devNBz1zQrb', // Brian: warm, calm
		maya: 'cgSgspJ2msm6clMCkdW9', // Jessica: friendly, upbeat
		arjun: 'iP95p4xoKVk53GoZ742B', // Chris: clear (swap for an Indian-English voice via TTS_VOICES)
	},
	// Sarvam Bulbul speakers (Indian English and Indian languages).
	sarvam: {sam: 'rahul', kira: 'priya', leo: 'aditya', maya: 'neha', arjun: 'rohan'},
	// OpenAI-style names, used by several OpenRouter voice models; other models need TTS_VOICES.
	openrouter: {sam: 'ash', kira: 'nova', leo: 'onyx', maya: 'shimmer', arjun: 'echo'},
} as const satisfies Record<string, Record<VoiceId, string>>;

export type TtsProvider = keyof typeof PROVIDER_VOICES;

/** The provider's voice for one of our voices, honouring a TTS_VOICES override like "sam=onyx,kira=nova". */
export function providerVoice(provider: TtsProvider, voice: VoiceId, overrides?: string): string {
	const custom = overrides
		?.split(',')
		.map((pair) => pair.split('='))
		.find(([id]) => id === voice)?.[1];
	return custom ?? PROVIDER_VOICES[provider][voice];
}

// ── Design presets (generic names only, never brand names: NFR-LEG-01) ─────
export const PRESET_IDS = [
	'dark-cinematic',
	'minimal-premium',
	'warm-editorial',
	'bold-kinetic',
	'playful-illustrated',
] as const;
export const PresetId = z.enum(PRESET_IDS);
export type PresetId = z.infer<typeof PresetId>;

export const DesignPreset = z.object({
	id: PresetId,
	name: z.string(),
	description: z.string(),
	tokens: DesignTokens,
});
export type DesignPreset = z.infer<typeof DesignPreset>;

const INTER = 'Inter';
export const DESIGN_PRESETS: readonly DesignPreset[] = [
	{
		id: 'dark-cinematic',
		name: 'Dark cinematic',
		description: 'Deep black canvas, violet glow, soft grain',
		tokens: {
			bg: '#0a0a0c',
			surface: '#141417',
			surfaceAlt: '#1c1c21',
			border: 'rgba(255,255,255,0.08)',
			fg: '#f5f5f7',
			muted: '#8a8a93',
			accent: '#7c5cff',
			accentFg: '#ffffff',
			radius: 14,
			fontFamily: INTER,
			motion: {pace: 'medium', easing: 'soft'},
		},
	},
	{
		id: 'minimal-premium',
		name: 'Minimal premium',
		description: 'Lots of white space, crisp type, slow moves',
		tokens: {
			bg: '#f4f4f1',
			surface: '#ffffff',
			surfaceAlt: '#f0f0ee',
			border: 'rgba(0,0,0,0.08)',
			fg: '#111111',
			muted: '#6b6b6b',
			accent: '#0a84ff',
			accentFg: '#ffffff',
			radius: 16,
			fontFamily: INTER,
			motion: {pace: 'calm', easing: 'soft'},
		},
	},
	{
		id: 'warm-editorial',
		name: 'Warm editorial',
		description: 'Cream paper, serif headlines, terracotta',
		tokens: {
			bg: '#f2e8d8',
			surface: '#fbf6ee',
			surfaceAlt: '#efe3cf',
			border: 'rgba(60,30,10,0.12)',
			fg: '#2a1a10',
			muted: '#7a6150',
			accent: '#c8643c',
			accentFg: '#ffffff',
			radius: 10,
			fontFamily: INTER,
			motion: {pace: 'calm', easing: 'soft'},
		},
	},
	{
		id: 'bold-kinetic',
		name: 'Bold kinetic',
		description: 'Huge uppercase type, fast hard cuts',
		tokens: {
			bg: '#111111',
			surface: '#1a1a1a',
			surfaceAlt: '#242424',
			border: 'rgba(255,255,255,0.1)',
			fg: '#ffffff',
			muted: '#9a9a9a',
			accent: '#ffdd00',
			accentFg: '#111111',
			radius: 4,
			fontFamily: INTER,
			motion: {pace: 'fast', easing: 'snappy'},
		},
	},
	{
		id: 'playful-illustrated',
		name: 'Playful illustrated',
		description: 'Hand-drawn shapes, bouncy springs',
		tokens: {
			bg: '#fff7f0',
			surface: '#ffffff',
			surfaceAlt: '#ffeede',
			border: 'rgba(0,0,0,0.08)',
			fg: '#1d1b3a',
			muted: '#6d6a8a',
			accent: '#ff8fab',
			accentFg: '#1d1b3a',
			radius: 24,
			fontFamily: INTER,
			motion: {pace: 'medium', easing: 'bouncy'},
		},
	},
];

// ── AI video models (post-MVP, F14) ──────────────────────────────────────────
// Provider ids must be re-checked against OpenRouter's /api/v1/videos/models
// before enabling (docs/TODO.md Phase 10).
export const VIDEO_MODEL_IDS = ['veo', 'wan', 'hailuo'] as const;
export const VideoModelId = z.enum(VIDEO_MODEL_IDS);
export type VideoModelId = z.infer<typeof VideoModelId>;

export const VIDEO_MODELS: Readonly<
	Record<VideoModelId, {name: string; providerId: string; maxClipSec: number; enabled: boolean}>
> = {
	veo: {name: 'Veo', providerId: 'google/veo-3.1', maxClipSec: 8, enabled: false},
	wan: {name: 'Wan', providerId: 'alibaba/wan-2.7', maxClipSec: 5, enabled: false},
	hailuo: {name: 'Hailuo', providerId: 'minimax/hailuo-3', maxClipSec: 6, enabled: false},
};

// ── Credit costs (PLACEHOLDER values) ────────────────────────────────────────
export const CREDIT_ITEMS = ['video_15s', 'video_30s', 'video_45s', 'voiceover', 'ai_clip', 'edit'] as const;
export const CreditItem = z.enum(CREDIT_ITEMS);
export type CreditItem = z.infer<typeof CreditItem>;

export const CREDIT_COSTS: Readonly<Record<CreditItem, number>> = {
	video_15s: 10,
	video_30s: 20,
	video_45s: 30,
	voiceover: 3,
	ai_clip: 15,
	edit: 2,
};

/** Edits per version that cost nothing (FR-EDIT-05). */
export const FREE_EDITS_PER_VERSION = 3;

// ── Plans and credit packs (PLACEHOLDER values; MVP: 1 plan + 2 packs) ──────
export const PLAN_CODES = ['go'] as const;
export const PlanCode = z.enum(PLAN_CODES);
export type PlanCode = z.infer<typeof PlanCode>;

export const PACK_CODES = ['pack_small', 'pack_large'] as const;
export const PackCode = z.enum(PACK_CODES);
export type PackCode = z.infer<typeof PackCode>;

export const PlanLimits = z.object({
	concurrentJobs: z.int().min(1),
	dailyJobs: z.int().min(1),
	aiClips: z.boolean(),
});
export type PlanLimits = z.infer<typeof PlanLimits>;

export const Plan = z.object({
	code: PlanCode,
	name: z.string(),
	/** null = price not decided yet; checkout refuses unpriced plans. */
	priceUsdCents: z.int().positive().nullable(),
	monthlyCredits: Credits,
	limits: PlanLimits,
});
export type Plan = z.infer<typeof Plan>;

export const CreditPack = z.object({
	code: PackCode,
	name: z.string(),
	priceUsdCents: z.int().positive().nullable(),
	credits: Credits,
});
export type CreditPack = z.infer<typeof CreditPack>;

export const PLANS: readonly Plan[] = [
	{
		code: 'go',
		name: 'Go',
		priceUsdCents: null,
		monthlyCredits: 100,
		limits: {concurrentJobs: 1, dailyJobs: 10, aiClips: false},
	},
];

export const CREDIT_PACKS: readonly CreditPack[] = [
	{code: 'pack_small', name: 'Small pack', priceUsdCents: null, credits: 60},
	{code: 'pack_large', name: 'Large pack', priceUsdCents: null, credits: 150},
];

/** Limits for users without a subscription (pay-as-you-go credits only). */
export const PAYG_LIMITS: PlanLimits = {concurrentJobs: 1, dailyJobs: 10, aiClips: false};
