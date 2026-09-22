import {bundle} from '@remotion/bundler';
import {getCompositions, renderStill} from '@remotion/renderer';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import pixelmatch from 'pixelmatch';
import {PNG} from 'pngjs';
import {beforeAll, describe, expect, it} from 'vitest';

// Visual baselines for every primitives composition (incl. RefIntro) at fixed
// frames. A change that moves more than 0.1% of pixels fails; if the change is
// intended, refresh the baselines with `pnpm test:visual:update` and review the PNGs.

const PRIMITIVES = fileURLToPath(new URL('../../../primitives/', import.meta.url));
const BASELINES = join(PRIMITIVES, 'visual-baselines');
const UPDATE = process.env.UPDATE_BASELINES === '1';
const MAX_DIFF_RATIO = 0.001;
/** Where in each composition to take a still. */
const POSITIONS = [0.25, 0.6, 0.9];
const SCALE = 0.5;

let serveUrl = '';
let compositions: Awaited<ReturnType<typeof getCompositions>> = [];

beforeAll(async () => {
	serveUrl = await bundle({entryPoint: join(PRIMITIVES, 'src/entry.ts')});
	compositions = await getCompositions(serveUrl, {logLevel: 'error'});
}, 180_000);

function compare(name: string, actual: Buffer) {
	const file = join(BASELINES, `${name}.png`);
	if (UPDATE || !existsSync(file)) {
		if (!UPDATE) throw new Error(`No baseline for ${name}. Run \`pnpm test:visual:update\` and review the new PNG.`);
		mkdirSync(BASELINES, {recursive: true});
		writeFileSync(file, actual);
		return 0;
	}
	const a = PNG.sync.read(actual);
	const b = PNG.sync.read(readFileSync(file));
	expect([a.width, a.height], `${name} size`).toEqual([b.width, b.height]);
	const diff = new PNG({width: a.width, height: a.height});
	const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {threshold: 0.1});
	const ratio = changed / (a.width * a.height);
	if (ratio > MAX_DIFF_RATIO) {
		const dir = process.env.VISUAL_DIFF_DIR ?? tmpdir();
		mkdirSync(dir, {recursive: true});
		const out = join(dir, `${name}.diff.png`);
		writeFileSync(out, PNG.sync.write(diff));
		writeFileSync(join(dir, `${name}.actual.png`), actual);
		throw new Error(`${name}: ${(ratio * 100).toFixed(3)}% of pixels changed (diff image: ${out})`);
	}
	return ratio;
}

describe('primitives visual baselines', () => {
	it('covers RefIntro and every primitives composition', () => {
		const ids = compositions.map((c) => c.id);
		expect(ids).toContain('RefIntro');
		expect(ids.length).toBeGreaterThanOrEqual(8);
	});

	it('every composition matches its baseline at fixed frames', async () => {
		const failures: string[] = [];
		for (const composition of compositions) {
			for (const position of POSITIONS) {
				const frame = Math.floor((composition.durationInFrames - 1) * position);
				const name = `${composition.id}-${frame}`;
				const {buffer} = await renderStill({
					serveUrl,
					composition,
					frame,
					imageFormat: 'png',
					scale: SCALE,
					logLevel: 'error',
				});
				try {
					compare(name, buffer!);
				} catch (error) {
					failures.push((error as Error).message);
				}
			}
		}
		expect(failures).toEqual([]);
	}, 600_000);
});
