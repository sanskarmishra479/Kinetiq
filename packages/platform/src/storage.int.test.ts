import {randomUUID} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {assertSafePrefix, memoryStorage, s3Storage} from './storage.js';

// The real S3 adapter against MinIO from docker compose (same API as Cloudflare R2).
const storage = s3Storage({
	endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
	region: 'auto',
	accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'minio',
	secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minio-secret',
	bucket: process.env.S3_BUCKET_CONTENT ?? 'kinetiq-content',
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe('s3Storage (MinIO)', () => {
	it('uploads through a presigned PUT, reads it back, serves a download link and deletes it', async () => {
		const key = `test/${randomUUID()}`;
		const put = await storage.presignPut(key, {contentType: 'image/png', expiresSec: 60});
		const uploaded = await fetch(put.url, {method: 'PUT', headers: put.headers, body: PNG});
		expect(uploaded.status).toBe(200);

		expect(await storage.head(key)).toEqual({size: PNG.length, contentType: 'image/png'});
		expect([...(await storage.readStart(key, 4))]).toEqual([0x89, 0x50, 0x4e, 0x47]);

		const url = await storage.presignGet(key, {expiresSec: 60, downloadName: 'my video.mp4'});
		const download = await fetch(url);
		expect(download.status).toBe(200);
		expect(download.headers.get('content-disposition')).toBe('attachment; filename="my_video.mp4"');

		await storage.delete(key);
		expect(await storage.head(key)).toBeNull();
	});

	it('rejects an upload that changes the signed content type (NFR-SEC-10)', async () => {
		const key = `test/${randomUUID()}`;
		const put = await storage.presignPut(key, {contentType: 'image/png', expiresSec: 60});
		const res = await fetch(put.url, {
			method: 'PUT',
			headers: {'content-type': 'text/html'},
			body: '<script>x</script>',
		});
		expect(res.status).toBe(403);
		expect(await storage.head(key)).toBeNull();
	});

	it('rejects a tampered or expired link', async () => {
		const key = `test/${randomUUID()}`;
		const put = await storage.presignPut(key, {contentType: 'image/png', expiresSec: 1});
		const tampered = put.url.replace(key, `${key}-other`);
		expect((await fetch(tampered, {method: 'PUT', headers: put.headers, body: PNG})).status).toBe(403);
		await new Promise((r) => setTimeout(r, 3100));
		expect((await fetch(put.url, {method: 'PUT', headers: put.headers, body: PNG})).status).toBe(403);
	});
});

describe('deletePrefix (account deletion, NFR-LEG-02)', () => {
	it('deletes every object in the folder and nothing outside it, across pages', async () => {
		const user = `usr_${randomUUID().replaceAll('-', '')}`;
		const other = `usr_${randomUUID().replaceAll('-', '')}`;
		const put = async (key: string) => {
			const p = await storage.presignPut(key, {contentType: 'image/png', expiresSec: 60});
			expect((await fetch(p.url, {method: 'PUT', headers: p.headers, body: PNG})).status).toBe(200);
		};
		await Promise.all([...Array.from({length: 3}, (_, i) => put(`u/${user}/a${i}`)), put(`u/${other}/keep`)]);

		expect(await storage.deletePrefix(`u/${user}/`)).toBe(3);
		expect(await storage.head(`u/${user}/a0`)).toBeNull();
		expect(await storage.head(`u/${other}/keep`)).not.toBeNull();
		await storage.deletePrefix(`u/${other}/`);
	});

	it('refuses prefixes that could match more than one folder', async () => {
		for (const bad of ['', 'u/', 'u/usr_1', '../u/x/', 'u/a/b/', 'u/*/']) {
			expect(() => assertSafePrefix(bad)).toThrow(/unsafe prefix/);
		}
		await expect(storage.deletePrefix('u/')).rejects.toThrow(/unsafe prefix/);
		expect(() => assertSafePrefix('u/usr_01ABC/')).not.toThrow();
	});
});

describe('memoryStorage', () => {
	it('deletes a folder', async () => {
		const mem = memoryStorage();
		mem.put('u/usr_1/a', PNG, 'image/png');
		mem.put('u/usr_2/a', PNG, 'image/png');
		expect(await mem.deletePrefix('u/usr_1/')).toBe(1);
		expect(mem.has('u/usr_2/a')).toBe(true);
		await expect(mem.deletePrefix('u/')).rejects.toThrow();
	});

	it('behaves like a tiny bucket', async () => {
		const mem = memoryStorage();
		mem.put('k', PNG, 'image/png');
		expect(await mem.head('k')).toEqual({size: PNG.length, contentType: 'image/png'});
		expect(await mem.presignGet('k', {expiresSec: 60, downloadName: 'a b'})).toContain('download=a%20b');
		expect(await mem.presignGet('k', {expiresSec: 60})).not.toContain('download');
		await mem.delete('k');
		expect(await mem.head('k')).toBeNull();
		expect((await mem.readStart('missing', 4)).length).toBe(0);
	});
});
