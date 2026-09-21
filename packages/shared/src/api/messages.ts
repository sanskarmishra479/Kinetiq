import {z} from 'zod';
import {CreditItem, Language, PresetId, VoiceId} from '../catalog.js';
import {BrandKitId, Credits, JobId, MessageId, Timestamp} from '../common.js';

// Chat: docs/API.md §5, SRS FR-CHAT-01…04, FR-EDIT-01.

export const MAX_MESSAGE_CHARS = 4000;

// Interactive widgets the assistant can attach to a message.
export const MessageUi = z.discriminatedUnion('type', [
	z.object({type: z.literal('choice'), key: z.string(), options: z.array(z.string()).min(1)}),
	z.object({type: z.literal('voicePicker'), key: z.literal('voice')}),
	z.object({type: z.literal('designPicker'), key: z.literal('design')}),
	z.object({
		type: z.literal('estimate'),
		credits: Credits,
		breakdown: z.array(z.object({item: CreditItem, credits: Credits})),
	}),
]);
export type MessageUi = z.infer<typeof MessageUi>;

export const Message = z.object({
	id: MessageId,
	role: z.enum(['user', 'assistant']),
	content: z.string(),
	ui: MessageUi.optional(),
	createdAt: Timestamp,
});
export type Message = z.infer<typeof Message>;

// Answers to the deterministic setup questions (FR-GEN-13: no LLM involved).
export const SetupAnswer = z.discriminatedUnion('key', [
	z.strictObject({key: z.literal('voiceover'), value: z.boolean()}),
	z.strictObject({key: z.literal('voice'), value: VoiceId}),
	z.strictObject({key: z.literal('language'), value: Language}),
	z.strictObject({key: z.literal('scriptBy'), value: z.enum(['ai', 'user'])}),
	z.strictObject({
		key: z.literal('design'),
		value: z.discriminatedUnion('kind', [
			z.strictObject({kind: z.literal('auto')}),
			z.strictObject({kind: z.literal('preset'), presetId: PresetId}),
			z.strictObject({kind: z.literal('brandKit'), brandKitId: BrandKitId}),
		]),
	}),
]);
export type SetupAnswer = z.infer<typeof SetupAnswer>;

export const SendMessageRequest = z
	.strictObject({
		content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS).optional(),
		answer: SetupAnswer.optional(),
	})
	.refine((m) => m.content !== undefined || m.answer !== undefined, 'send a message or an answer');
export type SendMessageRequest = z.infer<typeof SendMessageRequest>;

export const SendMessageResponse = z.object({
	message: Message,
	/** Set when the message started an edit job. */
	jobId: JobId.nullable(),
});
