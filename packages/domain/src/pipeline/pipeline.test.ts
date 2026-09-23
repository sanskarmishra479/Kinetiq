import {DESIGN_PRESETS, RENDER_FPS, type QaReport, type ResearchResult} from '@kinetiq/shared';
import {describe, expect, it} from 'vitest';
import {estimateWordTimings, spokenFrames, splitWords, wordsFromSeconds} from './captions.js';
import {fitToNarration, MIN_SCENE_FRAMES, planScenes, sceneCount, splitFrames} from './plan.js';
import {fixNotes, verdictFor, worthFixing} from './qa.js';
import {fontStack, onColor, shade, themeFromBrand, themeFromPreset} from './theme.js';

// The pure parts of the pipeline (FR-GEN-03, FR-GEN-07, FR-GEN-08).

const research: ResearchResult = {
	url: 'https://acme.com',
	productName: 'Acme',
	tagline: 'Analytics that answer questions',
	description: 'Acme turns product events into plain answers.',
	features: [
		{title: 'Ask anything', description: 'Type a question, get a chart.'},
		{title: 'Auto insights', description: 'We tell you what changed.'},
		{title: 'Share fast', description: 'Send a live chart anywhere.'},
	],
	audience: 'product teams',
	brand: {colors: ['#0b0b10', '#6d5efc', '#f5f5f7'], fonts: ['Inter'], logoKey: null},
	screenshots: [{key: 'scrape/acme.com/home.png', section: 'home'}],
};

describe('themeFromBrand', () => {
	it('builds a readable theme from the site colors', () => {
		const theme = themeFromBrand(research.brand);
		expect(theme.bg).toBe('#0b0b10');
		expect(theme.accent).toBe('#6d5efc');
		expect(theme.fg).toBe('#ffffff');
		expect(theme.fontFamily).toBe('Inter, sans-serif');
		expect(theme.surface).not.toBe(theme.bg);
	});

	it('falls back to the default preset when the site gives nothing usable', () => {
		const theme = themeFromBrand({colors: ['rgba(0,0,0,0.5)', 'not-a-color'], fonts: []});
		expect(theme).toMatchObject({
			bg: DESIGN_PRESETS[0]!.tokens.bg,
			accent: DESIGN_PRESETS[0]!.tokens.accent,
			fontFamily: 'Inter, sans-serif',
		});
	});

	it('puts the brand font first and always falls back to Inter, which the renderer loads', () => {
		expect(fontStack('Geist')).toBe('"Geist", Inter, sans-serif');
		expect(fontStack(undefined)).toBe('Inter, sans-serif');
		expect(fontStack('Inter')).toBe('Inter, sans-serif');
		// Site content can't break out of the CSS value.
		expect(fontStack('Evil"; background: url(x)')).toBe('"Evil background: url(x)", Inter, sans-serif');
		expect(fontStack('x'.repeat(100)).length).toBeLessThanOrEqual(80);
	});

	it('keeps text readable on a light brand', () => {
		const theme = themeFromBrand({colors: ['#ffffff', '#ffd23f'], fonts: ['Satoshi']});
		expect(theme.fg).toBe('#0b0b0d');
		expect(onColor('#ffffff')).toBe('#0b0b0d');
		expect(onColor('#000000')).toBe('#ffffff');
	});

	it('shades colors toward white and black, and leaves other formats alone', () => {
		expect(shade('#000000', 0.5)).toBe('#808080');
		expect(shade('#fff', -1)).toBe('#000000');
		expect(shade('rgba(0,0,0,0.1)', 0.5)).toBe('rgba(0,0,0,0.1)');
	});

	it('themeFromPreset picks a preset by id, or the default', () => {
		expect(themeFromPreset('dark-cinematic')).toEqual(DESIGN_PRESETS[0]!.tokens);
		expect(themeFromPreset('nope')).toEqual(DESIGN_PRESETS[0]!.tokens);
	});
});

describe('planScenes', () => {
	it.each([15, 30, 45] as const)('fills exactly %s seconds', (durationSec) => {
		const plan = planScenes({research, durationSec, voiceover: false});
		const frames = plan.scenes.reduce((sum, s) => sum + s.durationFrames, 0);
		expect(frames).toBe(durationSec * RENDER_FPS);
		expect(plan.scenes.length).toBe(sceneCount(durationSec));
		expect(plan.scenes.map((s) => s.index)).toEqual(plan.scenes.map((_, i) => i));
		expect(plan.scenes.every((s) => s.durationFrames >= MIN_SCENE_FRAMES)).toBe(true);
	});

	it('opens with a hook, ends on the logo and shows the product', () => {
		const plan = planScenes({research, durationSec: 30, voiceover: false});
		expect(plan.scenes[0]!.purpose).toBe('hook');
		expect(plan.scenes.at(-1)!.purpose).toBe('logo');
		expect(plan.scenes.some((s) => s.usesProductUi)).toBe(true);
		expect(plan.title).toContain('Acme');
	});

	it('writes narration only when there is a voiceover, and keeps the user prompt in the briefs', () => {
		const silent = planScenes({research, durationSec: 15, voiceover: false});
		expect(silent.scenes.every((s) => s.voiceoverText === null)).toBe(true);

		const spoken = planScenes({research, durationSec: 15, voiceover: true, prompt: 'make it playful'});
		expect(spoken.scenes.every((s) => (s.voiceoverText ?? '').length > 0)).toBe(true);
		expect(spoken.scenes[0]!.brief).toContain('make it playful');
	});

	it("uses the site's own words on screen", () => {
		const plan = planScenes({research, durationSec: 45, voiceover: false});
		const text = plan.scenes.flatMap((s) => s.onScreenText).join(' ');
		expect(text).toContain('Acme');
		expect(text).toContain('Ask anything');
	});

	it('still works for a site with no features or audience', () => {
		const bare = {...research, features: [], audience: null, tagline: ''};
		const plan = planScenes({research: bare, durationSec: 45, voiceover: true});
		expect(plan.scenes.every((s) => s.onScreenText.length > 0)).toBe(true);
	});
});

describe('splitFrames', () => {
	it('splits by weight and always adds up exactly', () => {
		expect(splitFrames(300, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(300);
		expect(splitFrames(450, [2, 1]).reduce((a, b) => a + b, 0)).toBe(450);
		expect(splitFrames(301, [1, 1, 1])).toEqual([101, 100, 100]);
	});

	it('never goes below the minimum scene length', () => {
		const frames = splitFrames(200, [10, 0.01, 0.01]);
		expect(Math.min(...frames)).toBeGreaterThanOrEqual(MIN_SCENE_FRAMES);
	});
});

describe('fitToNarration', () => {
	it('stretches only the scenes whose line takes longer than the scene', () => {
		const plan = planScenes({research, durationSec: 15, voiceover: true});
		const original = plan.scenes.map((s) => s.durationFrames);
		const fitted = fitToNarration(plan, [900, 0, 0, 0, 0]);
		expect(fitted.scenes[0]!.durationFrames).toBeGreaterThanOrEqual(900);
		expect(fitted.scenes.slice(1).map((s) => s.durationFrames)).toEqual(original.slice(1));
	});
});

describe('captions', () => {
	it('estimates how long a line takes and times each word', () => {
		expect(splitWords('  hello   there  ')).toEqual(['hello', 'there']);
		expect(spokenFrames('one two three')).toBeGreaterThan(RENDER_FPS / 2);
		const words = estimateWordTimings('one two three', 60);
		expect(words).toHaveLength(3);
		expect(words[0]!.start).toBe(60);
		expect(words[1]!.start).toBeGreaterThan(words[0]!.end);
	});

	it('converts provider timings to frames inside the video', () => {
		expect(
			wordsFromSeconds(
				[
					{text: 'hi', start: 1, end: 1.5},
					{text: 'late', start: 99, end: 100},
				],
				100,
			),
		).toEqual([
			{text: 'hi', start: 30, end: 45},
			{text: 'late', start: 99, end: 99},
		]);
	});
});

describe('visual QA decisions (FR-GEN-07, NFR-COST-04)', () => {
	const report = (pass: boolean, severity: 'low' | 'medium' | 'high' = 'high'): QaReport => ({
		sceneIndex: 0,
		pass,
		issues: pass ? [] : [{kind: 'overflow', severity, frame: 10, description: 'text runs off the frame'}],
	});

	it('ignores nits, fixes real problems, then falls back or accepts', () => {
		expect(verdictFor({report: report(true), fixes: 0, canFallBackToScreenshot: false})).toBe('ok');
		expect(verdictFor({report: report(false, 'low'), fixes: 0, canFallBackToScreenshot: false})).toBe('ok');
		expect(verdictFor({report: report(false), fixes: 0, canFallBackToScreenshot: false})).toBe('fix');
		expect(verdictFor({report: report(false), fixes: 1, canFallBackToScreenshot: true})).toBe('fallback');
		expect(verdictFor({report: report(false), fixes: 1, canFallBackToScreenshot: false})).toBe('accept');
		// A bigger allowance means more fix rounds before giving up.
		expect(verdictFor({report: report(false), fixes: 1, canFallBackToScreenshot: false}, 2)).toBe('fix');
	});

	it('worthFixing only counts medium and high issues', () => {
		expect(worthFixing(report(false, 'medium'))).toBe(true);
		expect(worthFixing(report(false, 'low'))).toBe(false);
		expect(worthFixing(report(true))).toBe(false);
	});

	it('hands back the worst issues first, in short lines', () => {
		const mixed: QaReport = {
			sceneIndex: 1,
			pass: false,
			issues: [
				{kind: 'low_contrast', severity: 'low', frame: 1, description: 'muted text is faint'},
				{kind: 'cut_off_text', severity: 'high', frame: 2, description: 'headline is cut off'},
			],
		};
		const notes = fixNotes(mixed);
		expect(notes[0]).toContain('cut_off_text (high) at frame 2');
		expect(fixNotes(mixed, 1)).toHaveLength(1);
	});
});
