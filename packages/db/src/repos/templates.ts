import {Duration, Ratio} from '@kinetiq/shared';
import {z} from 'zod';
import type {RepoDeps} from './shared.js';

// Templates are public catalog data: only published ones are ever returned.

const SlotType = z.enum(['text', 'image', 'ui', 'color', 'logo']);

export function templatesRepo({db}: RepoDeps) {
	const toSummary = (t: {
		id: string;
		slug: string;
		title: string;
		previewKey: string;
		posterKey: string;
		ratios: string[];
		durations: number[];
		creditDiscountPct: number;
	}) => ({
		id: t.id,
		slug: t.slug,
		title: t.title,
		previewKey: t.previewKey,
		posterKey: t.posterKey,
		ratios: z.array(Ratio).parse(t.ratios),
		durations: z.array(Duration).parse(t.durations),
		creditDiscountPct: t.creditDiscountPct,
	});

	return {
		async listPublished() {
			const rows = await db.template.findMany({where: {published: true}, orderBy: {createdAt: 'asc'}});
			return rows.map(toSummary);
		},

		async getPublishedBySlug(slug: string) {
			const row = await db.template.findFirst({where: {slug, published: true}, include: {slots: true}});
			if (!row) return null;
			return {
				template: toSummary(row),
				slots: row.slots.map((s) => ({
					key: s.key,
					type: SlotType.parse(s.type),
					...(s.maxChars === null ? {} : {maxChars: s.maxChars}),
				})),
			};
		},

		async isPublished(templateId: string): Promise<boolean> {
			return (await db.template.count({where: {id: templateId, published: true}})) > 0;
		},
	};
}
