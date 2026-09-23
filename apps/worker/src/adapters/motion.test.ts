import {memoryStorage} from '@kinetiq/platform';
import {PNG} from 'pngjs';
import {describe, expect, it} from 'vitest';
import {alwaysMoving, changedRatio, pngMotion} from './motion.js';

/** A 40×20 PNG, dark, with a light box from x=left to x=left+10. */
function frame(left: number, width = 40): Uint8Array {
	const png = new PNG({width, height: 20});
	for (let y = 0; y < 20; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			const light = x >= left && x < left + 10;
			png.data[i] = png.data[i + 1] = png.data[i + 2] = light ? 230 : 20;
			png.data[i + 3] = 255;
		}
	}
	return new Uint8Array(PNG.sync.write(png));
}

describe('motion check', () => {
	it('sees no change between identical frames and a real change when things move', () => {
		expect(changedRatio(frame(5), frame(5))).toBe(0);
		// The box moved 10px: 20 columns of 40 changed.
		expect(changedRatio(frame(5), frame(15))).toBeCloseTo(0.5, 5);
		// Different sizes can't be compared: treat as changed.
		expect(changedRatio(frame(5), frame(5, 30))).toBe(1);
	});

	it('reads the frames from storage', async () => {
		const storage = memoryStorage();
		storage.put('a.png', frame(5), 'image/png');
		storage.put('b.png', frame(5), 'image/png');
		expect(await pngMotion(storage).changedRatio('a.png', 'b.png')).toBe(0);
		await expect(pngMotion(storage).changedRatio('a.png', 'missing.png')).rejects.toThrow(/missing/);
		expect(await alwaysMoving().changedRatio('x', 'y')).toBe(1);
	});
});
