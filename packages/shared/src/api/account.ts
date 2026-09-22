import {z} from 'zod';
import {CreditPack, DesignPreset, DesignTokens, PackCode, Plan, PlanCode, PlanLimits, Voice} from '../catalog.js';
import {Job} from './jobs.js';
import {Project} from './projects.js';
import {
	AssetId,
	BrandKitId,
	BucketId,
	CreditDelta,
	Credits,
	Duration,
	JobId,
	LedgerId,
	Ratio,
	TemplateId,
	Timestamp,
	UserId,
	VersionId,
} from '../common.js';

// Account, versions, catalog, brand kits and billing: docs/API.md §3, §7, §10–12.

// ── Account ──────────────────────────────────────────────────────────────────
export const CreditBucket = z.object({
	id: BucketId,
	source: z.enum(['subscription', 'purchase']),
	remaining: Credits,
	expiresAt: Timestamp.nullable(),
});
export type CreditBucket = z.infer<typeof CreditBucket>;

export const MeResponse = z.object({
	user: z.object({
		id: UserId,
		email: z.email(),
		name: z.string().nullable(),
		image: z.url().nullable(),
	}),
	plan: z
		.object({
			code: PlanCode,
			status: z.enum(['active', 'past_due', 'cancelled']),
			currentPeriodEnd: Timestamp,
		})
		.nullable(),
	credits: z.object({
		/** Can be negative after a refund/chargeback clawback (FR-CRD-09). */
		total: z.int(),
		reserved: Credits,
		buckets: z.array(CreditBucket),
	}),
	limits: PlanLimits,
});
export type MeResponse = z.infer<typeof MeResponse>;

// ── Versions ─────────────────────────────────────────────────────────────────
export const Version = z.object({
	id: VersionId,
	number: z.int().min(1),
	createdAt: Timestamp,
	posterUrl: z.url().nullable(),
	durationSec: z.number().positive(),
	parentVersionId: VersionId.nullable(),
});
export type Version = z.infer<typeof Version>;

// ── Project detail (GET /v1/projects/:id) ───────────────────────────────────
export const ProjectDetailResponse = z.object({
	project: Project,
	latestVersion: Version.nullable(),
	activeJob: Job.nullable(),
});
export type ProjectDetailResponse = z.infer<typeof ProjectDetailResponse>;

// ── Catalog responses ────────────────────────────────────────────────────────
export const TemplateSummary = z.object({
	id: TemplateId,
	slug: z.string().regex(/^[a-z0-9-]+$/),
	title: z.string(),
	previewUrl: z.url(),
	posterUrl: z.url(),
	ratios: z.array(Ratio).min(1),
	durations: z.array(Duration).min(1),
	creditDiscountPct: z.int().min(0).max(90),
});

export const TemplateSlot = z.object({
	key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
	type: z.enum(['text', 'image', 'ui', 'color', 'logo']),
	maxChars: z.int().positive().optional(),
});

export const TemplateDetail = z.object({template: TemplateSummary, slots: z.array(TemplateSlot)});
export const VoicesResponse = z.object({items: z.array(Voice.extend({previewUrl: z.url()}).omit({previewKey: true}))});
export const DesignPresetsResponse = z.object({items: z.array(DesignPreset)});
export const PlansResponse = z.object({plans: z.array(Plan), packs: z.array(CreditPack)});

// ── Brand kits ───────────────────────────────────────────────────────────────
export const MAX_DESIGN_MD_BYTES = 20 * 1024;

export const CreateBrandKitRequest = z.union([
	z.strictObject({
		designMd: z
			.string()
			.min(1)
			.refine((s) => new TextEncoder().encode(s).length <= MAX_DESIGN_MD_BYTES, 'DESIGN.md must be at most 20 KB'),
	}),
	z.strictObject({assetId: AssetId}),
]);
export type CreateBrandKitRequest = z.infer<typeof CreateBrandKitRequest>;

export const BrandKitResponse = z.object({brandKit: z.object({id: BrandKitId, tokens: DesignTokens})});
export type BrandKitResponse = z.infer<typeof BrandKitResponse>;

// ── Billing ──────────────────────────────────────────────────────────────────
export const CheckoutRequest = z.union([z.strictObject({planCode: PlanCode}), z.strictObject({packCode: PackCode})]);
export type CheckoutRequest = z.infer<typeof CheckoutRequest>;

export const CheckoutResponse = z.object({checkoutUrl: z.url()});
export const PortalResponse = z.object({portalUrl: z.url()});

export const LedgerEntryType = z.enum(['grant', 'reserve', 'settle', 'refund', 'expire', 'clawback']);

export const LedgerEntry = z.object({
	id: LedgerId,
	type: LedgerEntryType,
	amount: CreditDelta,
	bucketId: BucketId.nullable(),
	jobId: JobId.nullable(),
	createdAt: Timestamp,
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;
