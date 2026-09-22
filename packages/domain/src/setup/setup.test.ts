import {describe, expect, it} from 'vitest';
import {
	applyAnswer,
	describeAnswer,
	DONE_MESSAGE,
	EMPTY_SETTINGS,
	followUp,
	introMessages,
	isComplete,
	nextQuestion,
	questionMessage,
	SetupError,
	type Settings,
} from './setup.js';

// FR-CHAT-01, FR-CHAT-02, FR-GEN-13 (deterministic, no LLM).

const answerAll = (answers: Parameters<typeof applyAnswer>[1][]) =>
	answers.reduce<Settings>((s, a) => applyAnswer(s, a), EMPTY_SETTINGS);

describe('setup flow', () => {
	it('asks voiceover → voice → language → script → design when voiceover is on', () => {
		const steps: (string | null)[] = [];
		let s = EMPTY_SETTINGS;
		const answers = [
			{key: 'voiceover', value: true},
			{key: 'voice', value: 'kira'},
			{key: 'language', value: 'en'},
			{key: 'scriptBy', value: 'ai'},
			{key: 'design', value: {kind: 'auto'}},
		] as const;
		for (const a of answers) {
			steps.push(nextQuestion(s));
			s = applyAnswer(s, a);
		}
		steps.push(nextQuestion(s));
		expect(steps).toEqual(['voiceover', 'voice', 'language', 'scriptBy', 'design', null]);
		expect(isComplete(s)).toBe(true);
		expect(s.voiceover).toEqual({enabled: true, voiceId: 'kira', language: 'en', scriptBy: 'ai'});
	});

	it('skips voice questions when voiceover is off', () => {
		const s = applyAnswer(EMPTY_SETTINGS, {key: 'voiceover', value: false});
		expect(nextQuestion(s)).toBe('design');
		expect(isComplete(applyAnswer(s, {key: 'design', value: {kind: 'preset', presetId: 'bold-kinetic'}}))).toBe(true);
	});

	it('refuses voice options while voiceover is off or unanswered', () => {
		expect(() => applyAnswer(EMPTY_SETTINGS, {key: 'voice', value: 'sam'})).toThrow(SetupError);
		const off = applyAnswer(EMPTY_SETTINGS, {key: 'voiceover', value: false});
		expect(() => applyAnswer(off, {key: 'language', value: 'en'})).toThrow('Turn on the voiceover');
	});

	it('lets users change their mind', () => {
		const full = answerAll([
			{key: 'voiceover', value: true},
			{key: 'voice', value: 'sam'},
			{key: 'language', value: 'en'},
			{key: 'scriptBy', value: 'user'},
			{key: 'design', value: {kind: 'auto'}},
		]);
		// Saying "yes" again keeps the existing choices.
		expect(applyAnswer(full, {key: 'voiceover', value: true})).toEqual(full);
		// Turning it off clears the voice choices.
		const off = applyAnswer(full, {key: 'voiceover', value: false});
		expect(off.voiceover).toEqual({enabled: false, voiceId: null, language: null, scriptBy: null});
		expect(isComplete(off)).toBe(true);
		// Changing just the voice.
		expect(applyAnswer(full, {key: 'voice', value: 'maya'}).voiceover?.voiceId).toBe('maya');
	});
});

describe('assistant messages', () => {
	it('builds a widget for every question', () => {
		expect(questionMessage('voiceover').ui).toEqual({type: 'choice', key: 'voiceover', options: ['yes', 'no']});
		expect(questionMessage('voice').ui).toEqual({type: 'voicePicker', key: 'voice'});
		expect(questionMessage('language').ui).toMatchObject({type: 'choice', key: 'language'});
		expect(questionMessage('scriptBy').ui).toMatchObject({type: 'choice', key: 'scriptBy'});
		expect(questionMessage('design').ui).toEqual({type: 'designPicker', key: 'design'});
	});

	it('adds the tip only when the user gave just a URL (FR-PRJ-06)', () => {
		const bare = introMessages({hasAssets: false, hasPrompt: false});
		expect(bare).toHaveLength(2);
		expect(bare[0]?.content).toContain('the more you give me');
		expect(bare[1]).toEqual(questionMessage('voiceover'));
		expect(introMessages({hasAssets: true, hasPrompt: false})).toHaveLength(1);
		expect(introMessages({hasAssets: false, hasPrompt: true})).toHaveLength(1);
	});

	it('follows up with the next question or "all set"', () => {
		expect(followUp(EMPTY_SETTINGS)).toEqual(questionMessage('voiceover'));
		const done = answerAll([
			{key: 'voiceover', value: false},
			{key: 'design', value: {kind: 'auto'}},
		]);
		expect(followUp(done)).toEqual(DONE_MESSAGE);
	});

	it('describes answers in plain words', () => {
		expect(describeAnswer({key: 'voiceover', value: true})).toBe('Yes, add a voiceover.');
		expect(describeAnswer({key: 'voiceover', value: false})).toBe('No voiceover.');
		expect(describeAnswer({key: 'voice', value: 'kira'})).toBe('Voice: Kira');
		expect(describeAnswer({key: 'language', value: 'en'})).toBe('Language: en');
		expect(describeAnswer({key: 'scriptBy', value: 'ai'})).toBe('You write the script.');
		expect(describeAnswer({key: 'scriptBy', value: 'user'})).toBe("I'll write the script.");
		expect(describeAnswer({key: 'design', value: {kind: 'auto'}})).toContain('website');
		expect(describeAnswer({key: 'design', value: {kind: 'preset', presetId: 'warm-editorial'}})).toContain(
			'warm-editorial',
		);
		expect(describeAnswer({key: 'design', value: {kind: 'brandKit', brandKitId: 'bk_12345678'}})).toContain(
			'DESIGN.md',
		);
	});
});
