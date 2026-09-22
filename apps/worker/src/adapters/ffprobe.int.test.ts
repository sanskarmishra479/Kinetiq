import {s3Storage} from '@kinetiq/platform';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';
import {checkVideo} from '../video-rules.js';
import {ffprobe} from './ffprobe.js';

// Real ffprobe against a real video in MinIO (FR-PRJ-04). CI installs ffmpeg.
const storage = s3Storage({
	endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
	region: 'auto',
	accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'minio',
	secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minio-secret',
	bucket: process.env.S3_BUCKET_CONTENT ?? 'kinetiq-content',
});
const dir = mkdtempSync(join(tmpdir(), 'kinetiq-probe-'));
afterAll(() => rmSync(dir, {recursive: true, force: true}));

async function uploadVideo(seconds: number) {
	const file = join(dir, `${randomUUID()}.mp4`);
	execFileSync('ffmpeg', [
		'-v',
		'error',
		'-f',
		'lavfi',
		'-i',
		`testsrc=size=320x240:rate=10:duration=${seconds}`,
		'-c:v',
		'libx264',
		'-pix_fmt',
		'yuv420p',
		file,
	]);
	const key = `test/${randomUUID()}.mp4`;
	const put = await storage.presignPut(key, {contentType: 'video/mp4', expiresSec: 60});
	const res = await fetch(put.url, {method: 'PUT', headers: put.headers, body: readFileSync(file)});
	expect(res.status).toBe(200);
	return {key, url: await storage.presignGet(key, {expiresSec: 60}), file};
}

describe('ffprobe', () => {
	it('reads a real video from storage', async () => {
		const {key, url} = await uploadVideo(2);
		const facts = await ffprobe().probe(url, 'video/mp4');
		expect(facts.video).toEqual({codec: 'h264', width: 320, height: 240});
		expect(facts.durationSec).toBeCloseTo(2, 0);
		expect(checkVideo(facts)).toMatchObject({ok: true});
		await storage.delete(key);
	});

	it('refuses local files and other protocols (no local file reads via ffmpeg)', async () => {
		const {key, file} = await uploadVideo(1);
		await expect(ffprobe().probe(file, 'video/mp4')).rejects.toThrow(/ffprobe failed/);
		await expect(ffprobe().probe(`file:${file}`, 'video/mp4')).rejects.toThrow(/ffprobe failed/);
		await storage.delete(key);
	});

	it('fails when the file is not the type we verified', async () => {
		const {key, url} = await uploadVideo(1);
		await expect(ffprobe().probe(url, 'video/webm')).rejects.toThrow(/ffprobe failed/);
		await storage.delete(key);
	});

	it('fails cleanly when ffprobe is missing', async () => {
		await expect(ffprobe('/nonexistent/ffprobe').probe('https://example.com/x.mp4', 'video/mp4')).rejects.toThrow(
			/ffprobe failed/,
		);
	});
});
