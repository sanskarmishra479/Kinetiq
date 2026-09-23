import {spreadWords, wordsFromCharacters} from '@kinetiq/domain';
import {providerVoice, VoiceId, type TtsProvider} from '@kinetiq/shared';
import {z} from 'zod';
import type {Costed, SpokenLine, VoicePort} from '../../ports.js';
import {audioDuration} from '../ffprobe.js';
import {call, Gate, ProviderError, type Fetch} from './http.js';

// Text to speech, one adapter per provider, chosen with TTS_PROVIDER
// (docs/ARCHITECTURE.md §5.1). Users see our 5 voice names; each maps to a
// provider voice (PROVIDER_VOICES, overridable with TTS_VOICES).
// Caption timing: ElevenLabs returns per-character timings (exact); Sarvam and
// OpenRouter return audio only, so words are spread over the measured length.

/** Rough dollar cost per character, for margin tracking (check your plan). */
const USD_PER_CHAR: Record<TtsProvider, number> = {elevenlabs: 0.0002, sarvam: 0.00002, openrouter: 0.000015};

export type VoiceOptions = {
	provider: TtsProvider;
	apiKey: string;
	/** Provider voice model; sensible default per provider. */
	model?: string | undefined;
	/** TTS_VOICES override, e.g. "sam=onyx,kira=nova". */
	voices?: string | undefined;
	fetch?: Fetch;
	timeoutMs?: number;
	gate?: Gate;
	/** Measures clip length (ffprobe); replaceable in tests. */
	measure?: typeof audioDuration;
};

const DEFAULT_MODEL: Record<TtsProvider, string> = {
	elevenlabs: 'eleven_multilingual_v2',
	sarvam: 'bulbul:v3',
	openrouter: '',
};

const ElevenLabsTimed = z.object({
	audio_base64: z.string().min(1),
	alignment: z
		.object({
			characters: z.array(z.string()),
			character_start_times_seconds: z.array(z.number()),
			character_end_times_seconds: z.array(z.number()),
		})
		.nullable()
		.optional(),
});

const SarvamResponse = z.object({audios: z.array(z.string().min(1)).min(1)});

/** Seconds of audio in a PCM WAV file, read from its header. */
export function wavDuration(bytes: Uint8Array): number {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const byteRate = view.getUint32(28, true);
	// Find the "data" chunk (headers can carry extra chunks before it).
	for (let offset = 12; offset + 8 <= bytes.length;) {
		const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
		const size = view.getUint32(offset + 4, true);
		if (id === 'data') return byteRate > 0 ? size / byteRate : 0;
		offset += 8 + size + (size % 2);
	}
	return 0;
}

export function voiceProvider(options: VoiceOptions): VoicePort {
	const fetch = options.fetch ?? globalThis.fetch;
	const gate = options.gate ?? new Gate(options.provider, {concurrency: 4, failures: 5, coolDownMs: 30_000});
	const http = {provider: options.provider, fetch, timeoutMs: options.timeoutMs ?? 90_000, gate};
	const model = options.model || DEFAULT_MODEL[options.provider];
	const measure = options.measure ?? audioDuration;

	const speakLine = async (text: string, voice: string, language: string): Promise<Omit<SpokenLine, 'index'>> => {
		switch (options.provider) {
			case 'elevenlabs': {
				const response = await call(
					http,
					`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`,
					{
						method: 'POST',
						headers: {'xi-api-key': options.apiKey, 'content-type': 'application/json'},
						body: JSON.stringify({text, model_id: model, language_code: language}),
					},
				);
				const body = ElevenLabsTimed.parse(await response.json());
				const audio = new Uint8Array(Buffer.from(body.audio_base64, 'base64'));
				const a = body.alignment;
				const words = a
					? wordsFromCharacters(a.characters, a.character_start_times_seconds, a.character_end_times_seconds)
					: [];
				const durationSec = words.at(-1)?.end ?? (await measure(audio, 'mp3'));
				return {
					audio,
					mime: 'audio/mpeg',
					durationSec,
					words: words.length > 0 ? words : spreadWords(text, durationSec),
				};
			}
			case 'sarvam': {
				const response = await call(http, 'https://api.sarvam.ai/text-to-speech', {
					method: 'POST',
					headers: {'api-subscription-key': options.apiKey, 'content-type': 'application/json'},
					body: JSON.stringify({text, target_language_code: `${language}-IN`, speaker: voice, model}),
				});
				const body = SarvamResponse.parse(await response.json());
				const audio = new Uint8Array(Buffer.from(body.audios[0]!, 'base64'));
				const durationSec = wavDuration(audio) || (await measure(audio, 'wav'));
				return {audio, mime: 'audio/wav', durationSec, words: spreadWords(text, durationSec)};
			}
			case 'openrouter': {
				const response = await call(http, 'https://openrouter.ai/api/v1/audio/speech', {
					method: 'POST',
					headers: {authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json'},
					body: JSON.stringify({model, input: text, voice, response_format: 'mp3'}),
				});
				const audio = new Uint8Array(await response.arrayBuffer());
				if (audio.length === 0) throw new ProviderError('openrouter', null, 'empty audio', true);
				const durationSec = await measure(audio, 'mp3');
				return {audio, mime: 'audio/mpeg', durationSec, words: spreadWords(text, durationSec)};
			}
		}
	};

	return {
		async speak({lines, voiceId, language}): Promise<Costed<SpokenLine[]>> {
			const voice = providerVoice(options.provider, VoiceId.parse(voiceId), options.voices);
			const spoken: SpokenLine[] = [];
			for (const line of lines) spoken.push({index: line.index, ...(await speakLine(line.text, voice, language))});
			const chars = lines.reduce((sum, l) => sum + l.text.length, 0);
			return {
				result: spoken,
				cost: {
					provider: `${options.provider}:${model || 'default'}`,
					units: chars,
					// Free models (":free") cost nothing.
					usdMicros: model?.endsWith(':free') ? 0 : Math.round(chars * USD_PER_CHAR[options.provider] * 1_000_000),
				},
			};
		},
	};
}
