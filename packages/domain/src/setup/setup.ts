import {
	LANGUAGES,
	VOICES,
	type DesignChoice,
	type MessageUi,
	type ProjectSettings,
	type SetupAnswer,
} from '@kinetiq/shared';
import type {z} from 'zod';

// The setup conversation before the first generation (FR-CHAT-01, FR-CHAT-02).
// Fully deterministic: no LLM is involved (FR-GEN-13), so it's free, instant
// and can't be steered by prompt injection.

export type Settings = z.infer<typeof ProjectSettings>;
export type Question = 'voiceover' | 'voice' | 'language' | 'scriptBy' | 'design';
export type AssistantMessage = {content: string; ui?: MessageUi};

export class SetupError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SetupError';
	}
}

export const EMPTY_SETTINGS: Settings = {voiceover: null, design: null};

/** The next unanswered question, or null when setup is complete. */
export function nextQuestion(s: Settings): Question | null {
	if (s.voiceover === null) return 'voiceover';
	if (s.voiceover.enabled) {
		if (s.voiceover.voiceId === null) return 'voice';
		if (s.voiceover.language === null) return 'language';
		if (s.voiceover.scriptBy === null) return 'scriptBy';
	}
	if (s.design === null) return 'design';
	return null;
}

export const isComplete = (s: Settings) => nextQuestion(s) === null;

/**
 * Applies one answer. Answers can come in any order (the user may change their
 * mind), but voice details need the voiceover switched on first.
 */
export function applyAnswer(s: Settings, answer: SetupAnswer): Settings {
	switch (answer.key) {
		case 'voiceover':
			if (!answer.value) return {...s, voiceover: {enabled: false, voiceId: null, language: null, scriptBy: null}};
			return s.voiceover?.enabled
				? s
				: {...s, voiceover: {enabled: true, voiceId: null, language: null, scriptBy: null}};
		case 'voice':
		case 'language':
		case 'scriptBy': {
			if (!s.voiceover?.enabled) throw new SetupError('Turn on the voiceover before choosing voice options.');
			const field = answer.key === 'voice' ? 'voiceId' : answer.key;
			return {...s, voiceover: {...s.voiceover, [field]: answer.value}};
		}
		case 'design':
			return {...s, design: answer.value as DesignChoice};
	}
}

const voiceName = (id: string) => VOICES.find((v) => v.id === id)?.name ?? id;

/** A short human sentence recording the user's answer in the chat. */
export function describeAnswer(answer: SetupAnswer): string {
	switch (answer.key) {
		case 'voiceover':
			return answer.value ? 'Yes, add a voiceover.' : 'No voiceover.';
		case 'voice':
			return `Voice: ${voiceName(answer.value)}`;
		case 'language':
			return `Language: ${answer.value}`;
		case 'scriptBy':
			return answer.value === 'ai' ? 'You write the script.' : "I'll write the script.";
		case 'design':
			if (answer.value.kind === 'auto') return 'Use my website’s style.';
			if (answer.value.kind === 'preset') return `Style preset: ${answer.value.presetId}`;
			return 'Use my DESIGN.md.';
	}
}

export function questionMessage(q: Question): AssistantMessage {
	switch (q) {
		case 'voiceover':
			return {content: 'Do you want a voiceover?', ui: {type: 'choice', key: 'voiceover', options: ['yes', 'no']}};
		case 'voice':
			return {content: 'Pick a voice (tap to hear a preview).', ui: {type: 'voicePicker', key: 'voice'}};
		case 'language':
			return {content: 'Which language?', ui: {type: 'choice', key: 'language', options: [...LANGUAGES]}};
		case 'scriptBy':
			return {
				content: 'Should I write the script, or will you?',
				ui: {type: 'choice', key: 'scriptBy', options: ['ai', 'user']},
			};
		case 'design':
			return {
				content:
					'Pick a design style: match your website (recommended), upload your own DESIGN.md, or choose a preset.',
				ui: {type: 'designPicker', key: 'design'},
			};
	}
}

export const DONE_MESSAGE: AssistantMessage = {
	content: 'All set! Review the cost and start your video when you’re ready.',
};

/** Assistant messages for a brand-new project: the tip (FR-PRJ-06) when only a URL was given, then the first question. */
export function introMessages(input: {hasAssets: boolean; hasPrompt: boolean}): AssistantMessage[] {
	const messages: AssistantMessage[] = [];
	if (!input.hasAssets && !input.hasPrompt) {
		messages.push({
			content:
				'Tip: a URL is all I need, but the more you give me (screenshots, a screen recording, a reference video, your story), the better your video gets.',
		});
	}
	messages.push(questionMessage('voiceover'));
	return messages;
}

/** What to say after an answer: the next question, or "all set". */
export function followUp(s: Settings): AssistantMessage {
	const q = nextQuestion(s);
	return q ? questionMessage(q) : DONE_MESSAGE;
}
