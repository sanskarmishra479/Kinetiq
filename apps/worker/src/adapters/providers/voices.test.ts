import {describe, expect, it} from 'vitest';
import {silentWav} from '../mock/index.js';
import {bytes, fakeFetch, json} from './fake-fetch.js';
import {Gate} from './http.js';
import {voiceProvider, wavDuration} from './voices.js';

// Contract tests: responses shaped like each provider's documented API.

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]);
const gate = () => new Gate('voice', {concurrency: 2, failures: 5, coolDownMs: 1000});
const line = {index: 0, text: 'Meet FernPay'};

describe('ElevenLabs (with timestamps: exact word timings)', () => {
	it('turns character timings into word timings and uses our voice mapping', async () => {
		const characters = [...'Meet FernPay'];
		const starts = characters.map((_, i) => i * 0.1);
		const fetch = fakeFetch([
			json({
				audio_base64: Buffer.from(MP3).toString('base64'),
				alignment: {
					characters,
					character_start_times_seconds: starts,
					character_end_times_seconds: starts.map((t) => t + 0.1),
				},
			}),
		]);
		const voice = voiceProvider({provider: 'elevenlabs', apiKey: 'el-test', fetch, gate: gate()});
		const {result, cost} = await voice.speak({lines: [line], voiceId: 'kira', language: 'en'});

		const request = fetch.requests[0]!;
		expect(request.url).toBe(
			'https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL/with-timestamps?output_format=mp3_44100_128',
		);
		expect(request.headers['xi-api-key']).toBe('el-test');
		expect(request.body).toEqual({text: 'Meet FernPay', model_id: 'eleven_multilingual_v2', language_code: 'en'});
		expect(result[0]).toMatchObject({index: 0, mime: 'audio/mpeg'});
		expect(result[0]!.durationSec).toBeCloseTo(1.2, 5);
		expect(result[0]!.words.map((w) => w.text)).toEqual(['Meet', 'FernPay']);
		expect(result[0]!.words[1]!.start).toBeCloseTo(0.5, 5);
		expect([...result[0]!.audio]).toEqual([...MP3]);
		expect(cost).toMatchObject({provider: 'elevenlabs:eleven_multilingual_v2', units: 12});
	});

	it('honours a TTS_VOICES override', async () => {
		const fetch = fakeFetch([json({audio_base64: Buffer.from(MP3).toString('base64'), alignment: null})]);
		const voice = voiceProvider({
			provider: 'elevenlabs',
			apiKey: 'k',
			voices: 'arjun=MyIndianVoiceId',
			fetch,
			gate: gate(),
			measure: async () => 2,
		});
		const {result} = await voice.speak({lines: [line], voiceId: 'arjun', language: 'en'});
		expect(fetch.requests[0]!.url).toContain('/text-to-speech/MyIndianVoiceId/');
		// No alignment: length measured from the audio, words spread over it.
		expect(result[0]!.durationSec).toBe(2);
		expect(result[0]!.words.at(-1)!.end).toBeLessThanOrEqual(2);
	});
});

describe('Sarvam (base64 WAV, no timings)', () => {
	it('reads the WAV length from its header and spreads the words over it', async () => {
		const wav = silentWav(1.5);
		const fetch = fakeFetch([json({request_id: 'r1', audios: [Buffer.from(wav).toString('base64')]})]);
		const voice = voiceProvider({provider: 'sarvam', apiKey: 'sv-test', fetch, gate: gate()});
		const {result} = await voice.speak({lines: [line], voiceId: 'arjun', language: 'en'});

		expect(fetch.requests[0]).toMatchObject({
			url: 'https://api.sarvam.ai/text-to-speech',
			headers: {'api-subscription-key': 'sv-test'},
			body: {text: 'Meet FernPay', target_language_code: 'en-IN', speaker: 'rohan', model: 'bulbul:v3'},
		});
		expect(result[0]).toMatchObject({mime: 'audio/wav', durationSec: 1.5});
		expect(result[0]!.words.map((w) => w.text)).toEqual(['Meet', 'FernPay']);
	});
});

describe('OpenRouter (audio bytes, no timings)', () => {
	it('sends the chosen model and voice, and measures the audio', async () => {
		const fetch = fakeFetch([bytes(MP3, 'audio/mpeg'), bytes(MP3, 'audio/mpeg')]);
		const voice = voiceProvider({
			provider: 'openrouter',
			apiKey: 'or-test',
			model: 'openai/gpt-4o-mini-tts',
			fetch,
			gate: gate(),
			measure: async () => 1.1,
		});
		const {result, cost} = await voice.speak({
			lines: [line, {index: 2, text: 'Try it'}],
			voiceId: 'sam',
			language: 'en',
		});
		expect(fetch.requests[0]).toMatchObject({
			url: 'https://openrouter.ai/api/v1/audio/speech',
			headers: {authorization: 'Bearer or-test'},
			body: {model: 'openai/gpt-4o-mini-tts', input: 'Meet FernPay', voice: 'ash', response_format: 'mp3'},
		});
		expect(result.map((r) => [r.index, r.mime, r.durationSec])).toEqual([
			[0, 'audio/mpeg', 1.1],
			[2, 'audio/mpeg', 1.1],
		]);
		expect(cost).toMatchObject({provider: 'openrouter:openai/gpt-4o-mini-tts', units: 18});
	});

	it('rejects an empty reply and unknown voices', async () => {
		const empty = voiceProvider({
			provider: 'openrouter',
			apiKey: 'k',
			model: 'm/x',
			fetch: fakeFetch([bytes(new Uint8Array(0), 'audio/mpeg')]),
			gate: gate(),
		});
		await expect(empty.speak({lines: [line], voiceId: 'sam', language: 'en'})).rejects.toThrow(/empty audio/);
		const voice = voiceProvider({
			provider: 'openrouter',
			apiKey: 'k',
			model: 'm/x',
			fetch: fakeFetch([]),
			gate: gate(),
		});
		await expect(voice.speak({lines: [line], voiceId: 'bob', language: 'en'})).rejects.toThrow();
	});
});

describe('wavDuration', () => {
	it('reads the length from the header, and 0 for a file without audio data', () => {
		expect(wavDuration(silentWav(2, 24_000))).toBeCloseTo(2, 3);
		expect(wavDuration(silentWav(2, 24_000).slice(0, 36))).toBe(0);
	});
});
