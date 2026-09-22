import {bundle} from '@remotion/bundler';
import {makeCancelSignal, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import type {StoragePort} from '@kinetiq/platform';
import {RenderInput} from '@kinetiq/shared';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {RenderError, toRenderError, type RenderPort, type RenderResult} from './port.js';

// Renders with Chrome on this machine (RENDER_MODE=local). Development only:
// scene code runs in a local browser, so production builds refuse it (NFR-SEC-12).
// Remotion opens and closes the browser for each call. On timeout we use its
// cancel signal, which closes the browser and so also stops a scene stuck in
// an endless loop. (We don't pass our own browser: Remotion's cleanup of a
// borrowed browser can leave an unhandled rejection that would crash the worker.)

const COMPOSITION_ID = 'Final';
const ENTRY = fileURLToPath(new URL('../entry.ts', import.meta.url));

export type LocalRenderOptions = {
	storage: StoragePort;
	/** Hard limit per render. */
	timeoutMs?: number;
	/** Remotion's per-frame load limit (delayRender). */
	frameTimeoutMs?: number;
	concurrency?: number;
	env?: {NODE_ENV?: string};
};

let bundled: Promise<string> | null = null;

/** Bundles the renderer once per process (webpack), then reuses it. */
export function bundleRenderer(): Promise<string> {
	bundled ??= bundle({
		entryPoint: ENTRY,
		// Workspace packages import './x.js' that resolves to './x.ts' (NodeNext style).
		webpackOverride: (config) => ({
			...config,
			resolve: {...config.resolve, extensionAlias: {'.js': ['.ts', '.tsx', '.js']}},
		}),
	}).catch((error: unknown) => {
		bundled = null;
		throw error;
	});
	return bundled;
}

export function localRender(options: LocalRenderOptions): RenderPort {
	const env = options.env ?? process.env;
	if (env.NODE_ENV === 'production') {
		throw new Error('Local rendering is disabled in production; use RENDER_MODE=lambda (NFR-SEC-12)');
	}
	const timeoutMs = options.timeoutMs ?? 10 * 60_000;
	const frameTimeoutMs = options.frameTimeoutMs ?? 30_000;

	async function withBrowser<T>(input: RenderInput, run: (ctx: Ctx) => Promise<T>): Promise<T> {
		const parsed = RenderInput.safeParse(input);
		if (!parsed.success) throw new RenderError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'invalid input');
		const serveUrl = await bundleRenderer();
		const dir = await mkdtemp(join(tmpdir(), 'kinetiq-render-'));
		const {cancelSignal, cancel} = makeCancelSignal();
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			cancel();
		}, timeoutMs);
		try {
			const inputProps = parsed.data as unknown as Record<string, unknown>;
			const composition = await selectComposition({
				serveUrl,
				id: COMPOSITION_ID,
				inputProps,
				timeoutInMilliseconds: frameTimeoutMs,
				logLevel: 'error',
			});
			if (timedOut) throw new RenderError('TIMEOUT', 'The render took too long and was stopped');
			return await run({serveUrl, composition, inputProps, dir, cancelSignal});
		} catch (error) {
			throw toRenderError(error, timedOut);
		} finally {
			clearTimeout(timer);
			await rm(dir, {recursive: true, force: true});
		}
	}

	async function upload(file: string, key: string, contentType: string): Promise<RenderResult> {
		const body = new Uint8Array(await readFile(file));
		await options.storage.putObject(key, body, contentType);
		return {key, bytes: body.length};
	}

	return {
		renderStill: (input, {frame, outputKey}) =>
			withBrowser(input, async ({serveUrl, composition, inputProps, dir, cancelSignal}) => {
				const output = join(dir, 'still.png');
				await renderStill({
					serveUrl,
					composition,
					inputProps,
					frame,
					output,
					imageFormat: 'png',
					timeoutInMilliseconds: frameTimeoutMs,
					cancelSignal,
					logLevel: 'error',
				});
				return upload(output, outputKey, 'image/png');
			}),

		renderFinal: (input, {outputKey, onProgress}) =>
			withBrowser(input, async ({serveUrl, composition, inputProps, dir, cancelSignal}) => {
				const output = join(dir, 'video.mp4');
				await renderMedia({
					serveUrl,
					composition,
					inputProps,
					codec: 'h264',
					outputLocation: output,
					timeoutInMilliseconds: frameTimeoutMs,
					concurrency: options.concurrency ?? null,
					onProgress: ({progress}) => onProgress?.(progress),
					cancelSignal,
					logLevel: 'error',
				});
				return upload(output, outputKey, 'video/mp4');
			}),
	};
}

type Ctx = {
	serveUrl: string;
	composition: Awaited<ReturnType<typeof selectComposition>>;
	inputProps: Record<string, unknown>;
	dir: string;
	cancelSignal: ReturnType<typeof makeCancelSignal>['cancelSignal'];
};
