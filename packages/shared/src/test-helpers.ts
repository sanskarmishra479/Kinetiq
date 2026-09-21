import {expect} from 'vitest';
import type {z} from 'zod';

// Tiny helpers for contract tests: assert a value is accepted or rejected.
export function accepts<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
	const result = schema.safeParse(value);
	if (!result.success) throw new Error(`expected valid, got: ${JSON.stringify(result.error.issues)}`);
	return result.data;
}

export function rejects(schema: z.ZodType, value: unknown, messageIncludes?: string): void {
	const result = schema.safeParse(value);
	expect(result.success).toBe(false);
	if (messageIncludes && !result.success) {
		expect(result.error.issues.map((i) => i.message).join(' | ')).toContain(messageIncludes);
	}
}

export const ids = {
	user: 'usr_abc12345',
	project: 'prj_abc12345',
	message: 'msg_abc12345',
	job: 'job_abc12345',
	version: 'ver_abc12345',
	asset: 'ast_abc12345',
	asset2: 'ast_def67890',
	template: 'tpl_abc12345',
	brandKit: 'bk_abc12345',
	bucket: 'bkt_abc12345',
	ledger: 'led_abc12345',
	clip: 'clp_abc12345',
};

export const now = '2026-09-21T10:00:00.000Z';
