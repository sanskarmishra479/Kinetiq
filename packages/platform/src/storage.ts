import {
	DeleteObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	NotFound,
	PutObjectCommand,
	S3Client,
	S3ServiceException,
} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import type {PresignedPut, StoragePort} from './ports.js';

// S3-compatible storage: MinIO locally, Cloudflare R2 in production.
// Signed URLs point at the storage host (a different site than kinetiq.so),
// so user files can never run in our origin (NFR-SEC-10).

export type S3Options = {
	endpoint: string;
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucket: string;
};

export function s3Storage(opts: S3Options): StoragePort {
	const client = new S3Client({
		endpoint: opts.endpoint,
		region: opts.region,
		credentials: {accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey},
		forcePathStyle: true,
	});
	const Bucket = opts.bucket;

	return {
		async presignPut(key, {contentType, expiresSec}): Promise<PresignedPut> {
			// Content-Type is signed, so the browser can't upload under a different type.
			const url = await getSignedUrl(client, new PutObjectCommand({Bucket, Key: key, ContentType: contentType}), {
				expiresIn: expiresSec,
				signableHeaders: new Set(['content-type']),
			});
			return {
				method: 'PUT',
				url,
				headers: {'content-type': contentType},
				expiresAt: new Date(Date.now() + expiresSec * 1000),
			};
		},

		async head(key) {
			try {
				const res = await client.send(new HeadObjectCommand({Bucket, Key: key}));
				return {size: res.ContentLength ?? 0, contentType: res.ContentType};
			} catch (error) {
				if (
					error instanceof NotFound ||
					(error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)
				) {
					return null;
				}
				throw error;
			}
		},

		async readStart(key, length) {
			const res = await client.send(new GetObjectCommand({Bucket, Key: key, Range: `bytes=0-${length - 1}`}));
			return res.Body ? new Uint8Array(await res.Body.transformToByteArray()) : new Uint8Array(0);
		},

		async putObject(key, body, contentType) {
			await client.send(new PutObjectCommand({Bucket, Key: key, Body: body, ContentType: contentType}));
		},

		async delete(key) {
			await client.send(new DeleteObjectCommand({Bucket, Key: key}));
		},

		async deletePrefix(prefix) {
			assertSafePrefix(prefix);
			let deleted = 0;
			let ContinuationToken: string | undefined;
			do {
				const page = await client.send(
					new ListObjectsV2Command({Bucket, Prefix: prefix, MaxKeys: 1000, ContinuationToken}),
				);
				const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{Key: o.Key}] : []));
				if (keys.length > 0) {
					await client.send(new DeleteObjectsCommand({Bucket, Delete: {Objects: keys, Quiet: true}}));
					deleted += keys.length;
				}
				ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
			} while (ContinuationToken);
			return deleted;
		},

		async presignGet(key, {expiresSec, downloadName}) {
			return getSignedUrl(
				client,
				new GetObjectCommand({
					Bucket,
					Key: key,
					...(downloadName
						? {ResponseContentDisposition: `attachment; filename="${downloadName.replace(/[^\w.-]/g, '_')}"`}
						: {}),
				}),
				{expiresIn: expiresSec},
			);
		},
	};
}

/** Tests: an in-memory bucket. `put` simulates the browser's upload. */
export function memoryStorage(baseUrl = 'https://storage.test') {
	const objects = new Map<string, {bytes: Uint8Array; contentType: string}>();
	const storage: StoragePort & {
		put(key: string, bytes: Uint8Array, contentType: string): void;
		has(key: string): boolean;
	} = {
		put: (key, bytes, contentType) => void objects.set(key, {bytes, contentType}),
		has: (key) => objects.has(key),
		async presignPut(key, {contentType, expiresSec}) {
			return {
				method: 'PUT',
				url: `${baseUrl}/${key}?signature=test`,
				headers: {'content-type': contentType},
				expiresAt: new Date(Date.now() + expiresSec * 1000),
			};
		},
		async head(key) {
			const o = objects.get(key);
			return o ? {size: o.bytes.length, contentType: o.contentType} : null;
		},
		async readStart(key, length) {
			return objects.get(key)?.bytes.subarray(0, length) ?? new Uint8Array(0);
		},
		async putObject(key, body, contentType) {
			objects.set(key, {bytes: body, contentType});
		},
		async delete(key) {
			objects.delete(key);
		},
		async deletePrefix(prefix) {
			assertSafePrefix(prefix);
			const keys = [...objects.keys()].filter((k) => k.startsWith(prefix));
			for (const k of keys) objects.delete(k);
			return keys.length;
		},
		async presignGet(key, {downloadName}) {
			return `${baseUrl}/${key}?signature=test${downloadName ? `&download=${encodeURIComponent(downloadName)}` : ''}`;
		},
	};
	return storage;
}

/** Guards against deleting the whole bucket: a prefix must be a full folder like "u/usr_123/". */
export function assertSafePrefix(prefix: string): void {
	if (!/^[a-z]+\/[A-Za-z0-9_-]+\/$/.test(prefix)) throw new Error(`Refusing to delete unsafe prefix "${prefix}"`);
}
