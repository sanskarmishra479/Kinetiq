import {describe, expect, it} from 'vitest';
import {localRender, unavailableRender} from './index';
import {RenderError, toRenderError} from './port';

describe('toRenderError', () => {
	it('maps scene failures, timeouts and everything else', () => {
		expect(
			toRenderError(new Error('Uncaught [scene:hero-1] items.map is not a function\n  at x'), false),
		).toMatchObject({
			code: 'SCENE_ERROR',
			sceneId: 'hero-1',
			message: 'items.map is not a function',
		});
		expect(toRenderError(new Error('renderStill() got cancelled'), true)).toMatchObject({code: 'TIMEOUT'});
		expect(toRenderError(new Error('A delayRender() was called but not cleared after 30000ms'), false)).toMatchObject({
			code: 'TIMEOUT',
		});
		expect(toRenderError(new Error('Browser crashed\nstack'), false)).toMatchObject({
			code: 'RENDERER',
			message: 'Browser crashed',
		});
		expect(toRenderError('weird', false)).toMatchObject({code: 'RENDERER', message: 'weird'});
		const known = new RenderError('INVALID_INPUT', 'bad');
		expect(toRenderError(known, true)).toBe(known);
	});
});

describe('RenderPort factories', () => {
	it('local rendering refuses production (NFR-SEC-12)', () => {
		expect(() => localRender({storage: {} as never, env: {NODE_ENV: 'production'}})).toThrow(/disabled in production/);
		expect(() => localRender({storage: {} as never, env: {NODE_ENV: 'development'}})).not.toThrow();
	});

	it('the Lambda placeholder fails every render with a clear reason', async () => {
		const port = unavailableRender('not yet');
		await expect(port.renderFinal({} as never, {outputKey: 'k'})).rejects.toMatchObject({
			code: 'RENDERER',
			message: 'not yet',
		});
		await expect(port.renderStill({} as never, {frame: 0, outputKey: 'k'})).rejects.toThrow('not yet');
	});
});
