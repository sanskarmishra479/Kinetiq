import {z} from 'zod';
import {AssetId, Timestamp} from '../common.js';

// Uploads: docs/API.md §9, SRS FR-PRJ-04/05, NFR-SEC-10.
// Only these types are accepted. SVG, HTML, PDF and everything else are
// rejected because they can carry scripts.

const MB = 1024 * 1024;

export const UPLOAD_RULES = {
	'image/png': {maxBytes: 10 * MB, kind: 'image'},
	'image/jpeg': {maxBytes: 10 * MB, kind: 'image'},
	'image/webp': {maxBytes: 10 * MB, kind: 'image'},
	'video/mp4': {maxBytes: 100 * MB, kind: 'video'},
	'video/webm': {maxBytes: 100 * MB, kind: 'video'},
} as const;

export type UploadMime = keyof typeof UPLOAD_RULES;
export const UploadMime = z.enum(Object.keys(UPLOAD_RULES) as [UploadMime, ...UploadMime[]]);

/** Longest accepted video, checked with ffprobe by the worker. */
export const MAX_VIDEO_SECONDS = 120;

export const AssetKind = z.enum(['screenshot', 'recording', 'logo', 'reference', 'designMd', 'other']);

export const CreateUploadRequest = z
	.strictObject({
		// Display name only; the server generates the storage key (never the client).
		filename: z
			.string()
			.trim()
			.min(1)
			.max(200)
			.regex(/^[^/\\\0]+$/, 'must not contain path separators'),
		mime: UploadMime,
		size: z.int().positive(),
		kind: AssetKind,
	})
	.superRefine((req, ctx) => {
		const rule = UPLOAD_RULES[req.mime];
		if (req.size > rule.maxBytes) {
			ctx.addIssue({code: 'custom', path: ['size'], message: `must be at most ${rule.maxBytes / MB} MB`});
		}
		if (req.kind === 'recording' && rule.kind !== 'video') {
			ctx.addIssue({code: 'custom', path: ['kind'], message: 'a recording must be a video'});
		}
	});
export type CreateUploadRequest = z.infer<typeof CreateUploadRequest>;

export const CreateUploadResponse = z.object({
	assetId: AssetId,
	upload: z.object({
		url: z.url(),
		fields: z.record(z.string(), z.string()),
	}),
	expiresAt: Timestamp,
});

export const AssetStatus = z.enum(['pending', 'ready', 'rejected']);

export const Asset = z.object({
	id: AssetId,
	kind: AssetKind,
	mime: UploadMime,
	size: z.int().positive(),
	status: AssetStatus,
	createdAt: Timestamp,
});
export type Asset = z.infer<typeof Asset>;
