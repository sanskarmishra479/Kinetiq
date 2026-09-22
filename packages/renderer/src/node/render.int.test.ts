import {compileScene} from '@kinetiq/domain';
import {memoryStorage} from '@kinetiq/platform';
import {darkCinematic} from '@kinetiq/primitives';
import type {Ratio, RenderInput} from '@kinetiq/shared';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createServer, type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {VALID_SCENES} from '../../../domain/src/validator/fixtures/valid';
import {localRender} from './local';
import {RenderError} from './port';

// Renders through RenderPort with real Chrome (FR-GEN-06/08, NFR-SEC-12).
// Phase 7 exit criterion: a hand-written scene renders to MP4 locally.

const dir = mkdtempSync(join(tmpdir(), 'kinetiq-render-test-'));
const storage = memoryStorage();
const render = localRender({storage, timeoutMs: 120_000});

function compiled(source: string): string {
	const result = compileScene(source);
	if (!result.ok) throw new Error(JSON.stringify(result.errors));
	return result.code;
}

const TITLE = compiled(VALID_SCENES.title!);
const SVG = compiled(VALID_SCENES.arrowWithTypesAndSvg!);
const PRIMITIVES = compiled(VALID_SCENES.sequencesAndProps!);

const input = (overrides: Partial<RenderInput> = {}): RenderInput => ({
	ratio: '16:9',
	theme: {...darkCinematic},
	scenes: [
		{id: 'title', code: TITLE, durationInFrames: 15, props: {headline: 'Kinetiq', lines: ['URL', 'to video']}},
		{id: 'svg', code: SVG, durationInFrames: 15, props: {}},
	],
	...overrides,
});

function probe(bytes: Uint8Array) {
	const file = join(dir, `${Math.random().toString(36).slice(2)}.mp4`);
	writeFileSync(file, bytes);
	const out = execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
	return JSON.parse(out.toString()) as {
		format: {duration: string};
		streams: {codec_type: string; codec_name: string; width?: number; height?: number; r_frame_rate?: string}[];
	};
}

async function bytesOf(key: string, size: number) {
	return storage.readStart(key, size);
}

// A tiny local server for the audio track (the page may only load media from assetOrigins).
let server: Server;
let origin = '';
beforeAll(async () => {
	const wav = join(dir, 'tone.wav');
	execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', wav]);
	const tone = readFileSync(wav);
	server = createServer((_req, res) => {
		res.writeHead(200, {'content-type': 'audio/wav', 'access-control-allow-origin': '*'});
		res.end(tone);
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
	await new Promise<void>((r) => server.close(() => r()));
	rmSync(dir, {recursive: true, force: true});
});

describe('renderFinal: output spec per ratio (FR-GEN-08)', () => {
	const SIZE: Record<Ratio, [number, number]> = {'16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080]};

	it.each(Object.entries(SIZE) as [Ratio, [number, number]][])(
		'%s renders H.264 at the right size, 30 fps and length',
		async (ratio, [width, height]) => {
			const result = await render.renderFinal(input({ratio}), {outputKey: `out/${ratio}.mp4`});
			const info = probe(await bytesOf(result.key, result.bytes));
			const video = info.streams.find((s) => s.codec_type === 'video')!;
			expect(video).toMatchObject({codec_name: 'h264', width, height, r_frame_rate: '30/1'});
			expect(Math.abs(Number(info.format.duration) - 1)).toBeLessThanOrEqual(0.5);
			expect((await storage.head(result.key))?.contentType).toBe('video/mp4');
		},
		180_000,
	);

	it('mixes audio tracks, captions and the lens finish', async () => {
		let progress = 0;
		const result = await render.renderFinal(
			input({
				audio: [{src: `${origin}/tone.wav`, volume: 0.5}],
				captions: [{text: 'Hello', start: 0, end: 20}],
				lens: true,
				assetOrigins: [origin],
			}),
			{outputKey: 'out/audio.mp4', onProgress: (p) => (progress = p)},
		);
		const info = probe(await bytesOf(result.key, result.bytes));
		expect(info.streams.map((s) => s.codec_type).sort()).toEqual(['audio', 'video']);
		expect(info.streams.find((s) => s.codec_type === 'audio')?.codec_name).toBe('aac');
		expect(progress).toBe(1);
	}, 180_000);

	it('renders the primitives scene (Series.Sequence, Browser, Window, Cursor)', async () => {
		const result = await render.renderFinal(
			input({
				scenes: [
					{
						id: 'ui',
						code: PRIMITIVES,
						durationInFrames: 30,
						props: {url: 'https://acme.com', items: [{label: 'Fast'}, {label: 'Secure'}], config: {speed: 1}},
					},
				],
			}),
			{outputKey: 'out/ui.mp4'},
		);
		expect(result.bytes).toBeGreaterThan(1000);
	}, 180_000);
});

describe('renderStill', () => {
	it('renders one PNG frame', async () => {
		const result = await render.renderStill(input(), {frame: 20, outputKey: 'stills/a.png'});
		const png = await bytesOf(result.key, 8);
		expect([...png]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	}, 120_000);
});

describe('failures are mapped for the fix loop', () => {
	const failing = (code: string) =>
		render.renderStill(input({scenes: [{id: 'bad-scene', code, durationInFrames: 10, props: {}}]}), {
			frame: 0,
			outputKey: 'stills/x.png',
		});

	it('a scene that crashes while rendering → SCENE_ERROR naming the scene', async () => {
		const code = compiled('export default ({items}: {items: string[]}) => <div>{items.map((i) => i)}</div>;');
		const error = await failing(code).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(RenderError);
		expect(error).toMatchObject({code: 'SCENE_ERROR', sceneId: 'bad-scene'});
		expect((error as Error).message).toMatch(/map/);
	}, 120_000);

	it('an endless loop is stopped by the timeout (the loop passes validation)', async () => {
		const code = compiled('export default () => { let i = 0; while (i >= 0) { i++; } return <div />; };');
		const quick = localRender({storage, timeoutMs: 15_000});
		const started = Date.now();
		const error = await quick
			.renderStill(input({scenes: [{id: 'loop', code, durationInFrames: 10, props: {}}]}), {
				frame: 0,
				outputKey: 'stills/loop.png',
			})
			.catch((e: unknown) => e);
		expect(error).toMatchObject({code: 'TIMEOUT'});
		expect(Date.now() - started).toBeLessThan(60_000);
	}, 90_000);

	it('invalid input is rejected before a browser starts', async () => {
		const error = await render.renderFinal({...input(), scenes: []}, {outputKey: 'x.mp4'}).catch((e: unknown) => e);
		expect(error).toMatchObject({code: 'INVALID_INPUT'});
		const remote = await render
			.renderFinal(input({audio: [{src: 'http://evil.test/a.wav'}]}), {outputKey: 'x.mp4'})
			.catch((e: unknown) => e);
		expect(remote).toMatchObject({code: 'INVALID_INPUT'});
	});
});

describe('page security (NFR-SEC-12)', () => {
	// These scenes are NOT validated on purpose: they check the second fence,
	// in case some code ever slipped past the validator.
	it('the Content-Security-Policy is installed before scene code runs', async () => {
		const code =
			"var m = document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]'); throw new Error(m ? m.content : 'no csp');";
		const error = await render
			.renderStill(input({scenes: [{id: 'probe', code, durationInFrames: 10, props: {}}]}), {
				frame: 0,
				outputKey: 'stills/csp.png',
			})
			.catch((e: unknown) => e);
		expect(error).toMatchObject({code: 'SCENE_ERROR', sceneId: 'probe'});
		expect((error as Error).message).toContain("default-src 'none'");
	}, 120_000);

	it('the policy is enforced: injected inline scripts do not run', async () => {
		// Without the CSP an inserted inline script runs synchronously and sets the flag.
		const code =
			"var s = document.createElement('script'); s.textContent = 'window.__ran = 1'; document.head.appendChild(s); throw new Error('inline script ran: ' + (window.__ran === 1));";
		const error = await render
			.renderStill(input({scenes: [{id: 'probe', code, durationInFrames: 10, props: {}}]}), {
				frame: 0,
				outputKey: 'stills/csp2.png',
			})
			.catch((e: unknown) => e);
		expect((error as Error).message).toContain('inline script ran: false');
	}, 120_000);

	it('refuses to run in production', () => {
		expect(() => localRender({storage, env: {NODE_ENV: 'production'}})).toThrow(/disabled in production/);
	});
});
