import {describe, expect, it} from 'vitest';
import {DESIGN_PRESETS} from '../catalog.js';
import {accepts, ids, now, rejects} from '../test-helpers.js';
import {
	BrandKitResponse,
	CheckoutRequest,
	CreateBrandKitRequest,
	LedgerEntry,
	MeResponse,
	PlansResponse,
	TemplateDetail,
	Version,
	VoicesResponse,
} from './account.js';
import {PLANS, CREDIT_PACKS} from '../catalog.js';

describe('MeResponse', () => {
	const me = {
		user: {id: ids.user, email: 'asha@acme.com', name: 'Asha', image: null},
		plan: {code: 'go', status: 'active', currentPeriodEnd: now},
		credits: {
			total: 140,
			reserved: 0,
			buckets: [
				{id: ids.bucket, source: 'subscription', remaining: 90, expiresAt: now},
				{id: 'bkt_def67890', source: 'purchase', remaining: 50, expiresAt: null},
			],
		},
		limits: {concurrentJobs: 1, dailyJobs: 10, aiClips: false},
	};

	it('accepts a subscriber and a pay-as-you-go user', () => {
		accepts(MeResponse, me);
		accepts(MeResponse, {...me, plan: null});
	});

	it('allows a negative total only (after a clawback), never negative buckets', () => {
		accepts(MeResponse, {...me, credits: {...me.credits, total: -20}});
		rejects(MeResponse, {
			...me,
			credits: {...me.credits, buckets: [{id: ids.bucket, source: 'purchase', remaining: -1, expiresAt: null}]},
		});
	});
});

describe('versions and catalog', () => {
	it('validates versions', () => {
		accepts(Version, {
			id: ids.version,
			number: 1,
			createdAt: now,
			posterUrl: null,
			durationSec: 30,
			parentVersionId: null,
		});
		rejects(Version, {
			id: ids.version,
			number: 0,
			createdAt: now,
			posterUrl: null,
			durationSec: 30,
			parentVersionId: null,
		});
	});

	it('validates templates and slots', () => {
		accepts(TemplateDetail, {
			template: {
				id: ids.template,
				slug: 'desktop-story',
				title: 'Desktop story',
				previewUrl: 'https://cdn.kinetiq.so/t/desktop-story.mp4',
				posterUrl: 'https://cdn.kinetiq.so/t/desktop-story.jpg',
				ratios: ['16:9'],
				durations: [15, 30],
				creditDiscountPct: 20,
			},
			slots: [
				{key: 'productName', type: 'text', maxChars: 24},
				{key: 'logo', type: 'logo'},
			],
		});
		rejects(TemplateDetail, {template: {slug: 'Bad Slug'}, slots: []});
	});

	it('serves voices with preview URLs instead of storage keys', () => {
		accepts(VoicesResponse, {
			items: [
				{
					id: 'sam',
					name: 'Sam',
					traits: 'confident',
					languages: ['en'],
					previewUrl: 'https://cdn.kinetiq.so/v/sam.mp3',
				},
			],
		});
	});

	it('accepts the real plan catalog', () => {
		accepts(PlansResponse, {plans: PLANS, packs: CREDIT_PACKS});
	});
});

describe('brand kits', () => {
	it('accepts pasted DESIGN.md or an uploaded file', () => {
		accepts(CreateBrandKitRequest, {designMd: '# Brand\nPrimary: #16a34a'});
		accepts(CreateBrandKitRequest, {assetId: ids.asset});
	});

	it('rejects oversized, empty or mixed requests', () => {
		rejects(CreateBrandKitRequest, {designMd: 'x'.repeat(20 * 1024 + 1)});
		rejects(CreateBrandKitRequest, {designMd: ''});
		rejects(CreateBrandKitRequest, {designMd: '# a', assetId: ids.asset});
	});

	it('returns validated tokens', () => {
		accepts(BrandKitResponse, {brandKit: {id: ids.brandKit, tokens: DESIGN_PRESETS[0]?.tokens}});
	});
});

describe('billing', () => {
	it('accepts exactly one of plan or pack', () => {
		accepts(CheckoutRequest, {planCode: 'go'});
		accepts(CheckoutRequest, {packCode: 'pack_small'});
		rejects(CheckoutRequest, {planCode: 'go', packCode: 'pack_small'});
		rejects(CheckoutRequest, {planCode: 'enterprise'});
		rejects(CheckoutRequest, {amount: 1});
	});

	it('validates ledger entries (signed amounts)', () => {
		const entry = accepts(LedgerEntry, {
			id: ids.ledger,
			type: 'reserve',
			amount: -23,
			bucketId: ids.bucket,
			jobId: ids.job,
			createdAt: now,
		});
		expect(entry.amount).toBe(-23);
		rejects(LedgerEntry, {...entry, amount: 1.5});
		rejects(LedgerEntry, {...entry, type: 'gift'});
	});
});
