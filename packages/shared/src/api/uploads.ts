import {z} from 'zod';
import {AssetId, Timestamp} from '../common.js';

// Uploads: docs/API.md §9, SRS FR-PRJ-04/05, NFR-SEC-10.
// Only these types are accepted. SVG, HTML, PDF and everything else are
// rejected because they can carry scripts. Uploads use a presigned PUT
// (Cloudflare R2 doesn't support presigned POST); the server then checks the
// real size and the file's bytes before the asset can be used.

const MB = 1024 * 1024;

export const UPLOAD_RULES = {
	'image/png': {maxBytes: 10 * MB, kind: 'image'},
	'image/jpeg': {maxBytes: 10 * MB, kind: 'image'},
	'image/webp': {maxBytes: 10 * MB, kind: 'image'},
	'video/mp4': {maxBytes: 100 * MB, kind: 'video'},
	'video/webm': {maxBytes: 100 * MB, kind: 'video'},
	/** Only as a DESIGN.md upload (kind "designMd"). */
	'text/markdown': {maxBytes: 20 * 1024, kind: 'text'},
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
			const limit = rule.maxBytes >= MB ? `${rule.maxBytes / MB} MB` : `${rule.maxBytes / 1024} KB`;
			ctx.addIssue({code: 'custom', path: ['size'], message: `must be at most ${limit}`});
		}
		if (req.kind === 'recording' && rule.kind !== 'video') {
			ctx.addIssue({code: 'custom', path: ['kind'], message: 'a recording must be a video'});
		}
		if ((req.kind === 'designMd') !== (rule.kind === 'text')) {
			ctx.addIssue({code: 'custom', path: ['kind'], message: 'markdown is only accepted as a DESIGN.md upload'});
		}
	});
export type CreateUploadRequest = z.infer<typeof CreateUploadRequest>;

export const CreateUploadResponse = z.object({
	assetId: AssetId,
	/** The browser sends the file with exactly this method, URL and headers. */
	upload: z.object({
		method: z.literal('PUT'),
		url: z.url(),
		headers: z.record(z.string(), z.string()),
	}),
	expiresAt: Timestamp,
});
export type CreateUploadResponse = z.infer<typeof CreateUploadResponse>;

/** pending: waiting for the upload · processing: videos being checked by the worker · ready · rejected */
export const AssetStatus = z.enum(['pending', 'processing', 'ready', 'rejected']);

export const Asset = z.object({
	id: AssetId,
	kind: AssetKind,
	mime: UploadMime,
	size: z.int().positive(),
	status: AssetStatus,
	createdAt: Timestamp,
});
export type Asset = z.infer<typeof Asset>;
