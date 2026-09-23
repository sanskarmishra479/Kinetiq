import {compileScene} from '@kinetiq/domain';
import {planScenes} from '@kinetiq/domain';
import {ResearchResult} from '@kinetiq/shared';
import {describe, expect, it} from 'vitest';
import {clip, propsFor, SCENE_TEMPLATES, templateFor} from './scene-templates.js';
import {silentWav, siteFixtures} from './index.js';

describe('mock scene templates', () => {
	it.each(Object.entries(SCENE_TEMPLATES))('%s passes the sandbox validator', (_name, code) => {
		expect(compileScene(code)).toMatchObject({ok: true});
	});

	it('every fixture site yields props for every scene, with no repeated text', () => {
		for (const site of siteFixtures().values()) {
			const research = ResearchResult.parse({
				url: `https://${site.host}`,
				productName: site.title.split('—')[0]!.trim(),
				tagline: site.title.split('—')[1]!.trim(),
				description: site.description,
				features: site.features,
				audience: site.audience,
				brand: {colors: site.colors, fonts: site.fonts, logoKey: null},
				screenshots: [],
			});
			const plan = planScenes({research, durationSec: 45, voiceover: true});
			for (const brief of plan.scenes) {
				const props = propsFor(brief, research, templateFor(brief));
				expect(Object.keys(props).length).toBeGreaterThan(0);
				if ('subline' in props) expect(props.subline).not.toBe(props.headline);
			}
		}
		expect(siteFixtures().size).toBe(10);
	});
});

describe('clip', () => {
	it('shortens at a word boundary, never mid-word', () => {
		expect(clip('short', 10)).toBe('short');
		expect(clip('pay sellers in 40 countries from one API', 30)).toBe('pay sellers in 40 countries…');
		expect(clip('abcdefghijklmnopqrstuvwxyz', 10)).toBe('abcdefghi…');
	});
});

describe('silentWav', () => {
	it('is a valid WAV of the requested length', () => {
		const wav = silentWav(1, 24_000);
		expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF');
		expect(wav.length).toBe(44 + 24_000 * 2);
	});
});
