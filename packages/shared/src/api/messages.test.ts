import {describe, it} from 'vitest';
import {accepts, ids, now, rejects} from '../test-helpers.js';
import {Message, MessageUi, SendMessageRequest, SetupAnswer} from './messages.js';

describe('SendMessageRequest', () => {
	it('accepts free text, an answer, or both', () => {
		accepts(SendMessageRequest, {content: 'Make the intro faster'});
		accepts(SendMessageRequest, {answer: {key: 'voiceover', value: true}});
		accepts(SendMessageRequest, {content: 'yes', answer: {key: 'voiceover', value: true}});
	});

	it('rejects an empty message', () => {
		rejects(SendMessageRequest, {}, 'send a message or an answer');
		rejects(SendMessageRequest, {content: '   '});
	});

	it('bounds message length and rejects unknown fields', () => {
		rejects(SendMessageRequest, {content: 'x'.repeat(4001)});
		rejects(SendMessageRequest, {content: 'hi', role: 'assistant'});
	});
});

describe('SetupAnswer', () => {
	it('accepts every setup question', () => {
		accepts(SetupAnswer, {key: 'voiceover', value: false});
		accepts(SetupAnswer, {key: 'voice', value: 'sam'});
		accepts(SetupAnswer, {key: 'language', value: 'en'});
		accepts(SetupAnswer, {key: 'scriptBy', value: 'user'});
		accepts(SetupAnswer, {key: 'design', value: {kind: 'auto'}});
		accepts(SetupAnswer, {key: 'design', value: {kind: 'preset', presetId: 'bold-kinetic'}});
		accepts(SetupAnswer, {key: 'design', value: {kind: 'brandKit', brandKitId: ids.brandKit}});
	});

	it('rejects values that do not match the question', () => {
		rejects(SetupAnswer, {key: 'voice', value: 'morgan-freeman'});
		rejects(SetupAnswer, {key: 'voiceover', value: 'yes'});
		rejects(SetupAnswer, {key: 'design', value: {kind: 'preset', presetId: 'stripe'}});
		rejects(SetupAnswer, {key: 'unknown', value: 1});
	});
});

describe('Message', () => {
	it('accepts messages with and without widgets', () => {
		accepts(Message, {id: ids.message, role: 'user', content: 'hi', createdAt: now});
		accepts(Message, {
			id: ids.message,
			role: 'assistant',
			content: 'This costs 23 credits.',
			ui: {type: 'estimate', credits: 23, breakdown: [{item: 'video_30s', credits: 20}]},
			createdAt: now,
		});
	});

	it('validates widget shapes', () => {
		accepts(MessageUi, {type: 'choice', key: 'voiceover', options: ['yes', 'no']});
		accepts(MessageUi, {type: 'voicePicker', key: 'voice'});
		accepts(MessageUi, {type: 'designPicker', key: 'design'});
		rejects(MessageUi, {type: 'choice', key: 'voiceover', options: []});
		rejects(MessageUi, {type: 'estimate', credits: -1, breakdown: []});
	});
});
