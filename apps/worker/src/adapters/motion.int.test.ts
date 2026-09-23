import {compileScene, isStatic, MOTION_SAMPLES} from '@kinetiq/domain';
import {memoryStorage} from '@kinetiq/platform';
import {DESIGN_PRESETS} from '@kinetiq/shared';
import {localRender} from '@kinetiq/renderer/node';
import {describe, expect, it} from 'vitest';
import {SCENE_TEMPLATES} from './mock/scene-templates.js';
import {pngMotion} from './motion.js';

// The "something is always moving" rule, checked on real renders
// (user feedback 2026-09-23: scenes animated in, then froze for seconds).

const storage = memoryStorage();
const render = localRender({storage});
const motion = pngMotion(storage);
const LENGTH = 120;

// What the first templates did: the text arrives in the first half second, then nothing moves.
const ANIMATE_IN_THEN_HOLD = `import {AbsoluteFill} from 'remotion';
import {Background, BlurInText} from '@kinetiq/primitives';

export default function Held() {
	return (
		<Background>
			<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
				<BlurInText text="Payments for marketplaces" fontSize={80} weight={700} align="center" />
			</AbsoluteFill>
		</Background>
	);
}
`;

/** The least motion between consecutive sample frames, as the pipeline measures it. */
async function leastMotion(name: string, source: string, props: Record<string, unknown>) {
	const compiled = compileScene(source);
	if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));
	const input = {
		ratio: '16:9' as const,
		theme: (({motion: _motion, ...theme}) => theme)(DESIGN_PRESETS[0]!.tokens),
		scenes: [{id: 's0', code: compiled.code, durationInFrames: LENGTH, props: {...props, durationInFrames: LENGTH}}],
	};
	const keys: string[] = [];
	for (const [i, at] of MOTION_SAMPLES.entries()) {
		const key = `${name}-${i}.png`;
		await render.renderStill(input, {frame: Math.floor(LENGTH * at), outputKey: key, scale: 0.5});
		keys.push(key);
	}
	const ratios = await Promise.all(keys.slice(1).map((key, i) => motion.changedRatio(keys[i]!, key)));
	return Math.min(...ratios);
}

describe('always moving (real renders)', () => {
	it('flags a scene that animates in and then holds still', async () => {
		expect(isStatic(await leastMotion('held', ANIMATE_IN_THEN_HOLD, {}))).toBe(true);
	}, 180_000);

	it.each([
		['hook', {title: 'FernPay', subtitle: 'Payments for marketplaces, without the paperwork'}],
		['statement', {headline: 'Built for marketplace founders', detail: 'Split payouts, KYC and refunds in one API'}],
		['logo', {name: 'FernPay', tagline: 'Payments for marketplaces', domain: 'fernpay.io'}],
	] as const)(
		'the %s template keeps moving for the whole scene',
		async (name, props) => {
			expect(isStatic(await leastMotion(name, SCENE_TEMPLATES[name], props))).toBe(false);
		},
		180_000,
	);
});
