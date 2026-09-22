// Ports implemented by this package. Business code depends on these types,
// never on Redis, BullMQ or S3 directly (docs/ARCHITECTURE.md §8).

export type PresignedPut = {method: 'PUT'; url: string; headers: Record<string, string>; expiresAt: Date};

/** Object storage (S3-compatible: MinIO locally, Cloudflare R2 in production). */
export interface StoragePort {
	/** A short-lived URL the browser uses to upload exactly one object. */
	presignPut(key: string, opts: {contentType: string; expiresSec: number}): Promise<PresignedPut>;
	head(key: string): Promise<{size: number; contentType: string | undefined} | null>;
	/** The first `length` bytes (for file-type sniffing). */
	readStart(key: string, length: number): Promise<Uint8Array>;
	delete(key: string): Promise<void>;
	/** Deletes every object under a folder like "u/usr_123/". Returns how many were deleted. */
	deletePrefix(prefix: string): Promise<number>;
	/** A short-lived download URL; `downloadName` forces "save as" (Content-Disposition: attachment). */
	presignGet(key: string, opts: {expiresSec: number; downloadName?: string}): Promise<string>;
}
