import type {ClockPort, IdPort} from '@kinetiq/domain';
import type {Db} from '../client.js';
import {Prisma} from '../generated/prisma/client.js';

// Everything a repository needs. Clock and ids are injected so tests are
// deterministic (docs/TEST_PLAN.md rule T3).
export type RepoDeps = {db: Db; ids: IdPort; clock: ClockPort};

/** Cursor pagination over time-sortable ids: newest first, `cursor` = last id seen. */
export async function paginate<Row extends {id: string}, Out>(
	fetch: (args: {take: number; where: {id?: {lt: string}}}) => Promise<Row[]>,
	page: {limit: number; cursor?: string | undefined},
	map: (row: Row) => Out,
): Promise<{items: Out[]; nextCursor: string | null}> {
	const rows = await fetch({take: page.limit + 1, where: page.cursor ? {id: {lt: page.cursor}} : {}});
	const hasMore = rows.length > page.limit;
	const items = hasMore ? rows.slice(0, page.limit) : rows;
	return {items: items.map(map), nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null};
}

export const iso = (d: Date) => d.toISOString();
export const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);

/** True when the error is a unique-constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
	return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** App data for a required JSON column. */
export const json = (value: unknown) => value as Prisma.InputJsonValue;

/** App data for a nullable JSON column (null/undefined → database NULL). */
export const nullableJson = (value: unknown) =>
	value === null || value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);
