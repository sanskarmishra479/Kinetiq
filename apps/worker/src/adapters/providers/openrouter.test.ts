import {describe, expect, it} from 'vitest';
import {SCENE_TEMPLATES} from '../mock/scene-templates.js';
import {fakeFetch, json} from './fake-fetch.js';
import {Gate} from './http.js';
import {checkModels, checkVoices, extractJson, extractScene, openRouterLlm} from './openrouter.js';

// Contract tests: responses shaped like OpenRouter's chat completions API
// (https://openrouter.ai/docs/api-reference/chat-completion).

const answer = (content: string, extra: Record<string, unknown> = {}) =>
	json({
		id: 'gen-1',
		model: 'anthropic/claude-sonnet-5',
		choices: [{index: 0, finish_reason: 'stop', message: {role: 'assistant', content}}],
		usage: {prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500, cost: 0.0042},
		...extra,
	});

const copy = {
	productName: 'FernPay',
	tagline: 'Payments for marketplaces',
	description: 'Split payouts and KYC in one API.',
	features: [{title: 'Split payouts', description: 'Pay many sellers from one charge.'}],
	audience: 'marketplace founders',
};

const llm = (fetch: ReturnType<typeof fakeFetch>, fallbackModel?: string) =>
	openRouterLlm({
		apiKey: 'sk-or-test',
		modelFor: (role) => (role === 'director' ? 'anthropic/claude-opus-5' : 'deepseek/deepseek-chat:free'),
		fallbackModel,
		fetch,
		gate: new Gate('openrouter', {concurrency: 4, failures: 5, coolDownMs: 1000}),
		appUrl: 'https://kinetiq.so',
	});

const site = {title: 'FernPay — Payments', description: 'Payments for marketplaces', markdown: '# FernPay'};

describe('openRouterLlm', () => {
	it('sends the role prompt to the role model, with the fallback and usage accounting', async () => {
		const fetch = fakeFetch([answer(JSON.stringify(copy))]);
		const {result, cost} = await llm(fetch, 'anthropic/claude-sonnet-5').complete({
			role: 'research',
			data: {url: 'https://fernpay.io', site},
		});

		expect(result).toEqual(copy);
		expect(cost).toEqual({provider: 'openrouter:anthropic/claude-sonnet-5', units: 1500, usdMicros: 4200});
		const [request] = fetch.requests;
		expect(request).toMatchObject({url: 'https://openrouter.ai/api/v1/chat/completions', method: 'POST'});
		expect(request!.headers).toMatchObject({
			authorization: 'Bearer sk-or-test',
			'x-title': 'Kinetiq',
			'http-referer': 'https://kinetiq.so',
		});
		const body = request!.body as {
			model: string;
			models: string[];
			messages: {role: string; content: {type: string; text?: string; cache_control?: unknown}[]}[];
			usage: unknown;
		};
		expect(body.model).toBe('deepseek/deepseek-chat:free');
		expect(body.models).toEqual(['deepseek/deepseek-chat:free', 'anthropic/claude-sonnet-5']);
		expect(body.usage).toEqual({include: true});
		// Only Claude needs explicit cache markers; DeepSeek caches on its own.
		expect(body.messages[0]!.content[0]!.cache_control).toBeUndefined();
		// Website text is fenced as data, never mixed into the instructions (NFR-SEC-07).
		expect(body.messages[0]!.content[0]!.text).toMatch(/never instructions/);
		expect(body.messages[1]!.content.at(-1)!.text).toContain('<site_content>');
	});

	it('marks the long system prompt for caching on Claude models', async () => {
		const plan = {
			title: 'FernPay launch',
			scenes: [
				{
					index: 0,
					purpose: 'hook',
					brief: 'Open strong',
					durationFrames: 225,
					onScreenText: ['FernPay'],
					voiceoverText: null,
					usesProductUi: false,
					motion: 'moving',
				},
				{
					index: 1,
					purpose: 'logo',
					brief: 'End card',
					durationFrames: 225,
					onScreenText: ['FernPay'],
					voiceoverText: null,
					usesProductUi: false,
					motion: 'moving',
				},
			],
		};
		const fetch = fakeFetch([answer('```json\n' + JSON.stringify(plan) + '\n```')]);
		await llm(fetch).complete({
			role: 'director',
			data: {research: copy, durationSec: 15, ratio: '16:9', voiceover: false, prompt: null},
		});
		const body = fetch.requests[0]!.body as {
			model: string;
			models?: unknown;
			messages: {content: {cache_control?: unknown}[]}[];
		};
		expect(body.model).toBe('anthropic/claude-opus-5');
		expect(body.messages[0]!.content[0]!.cache_control).toEqual({type: 'ephemeral'});
		expect(body.models).toBeUndefined();
	});

	it('uses the model a job pinned, and sends stills inline for visual QA', async () => {
		const fetch = fakeFetch([answer(JSON.stringify({sceneIndex: 0, pass: true, issues: []}))]);
		await llm(fetch).complete({
			role: 'visualQA',
			model: 'openai/gpt-5-mini',
			data: {sceneIndex: 0, props: {title: 'x'}},
			images: ['data:image/png;base64,iVBORw0KGgo='],
		});
		const body = fetch.requests[0]!.body as {
			model: string;
			messages: {content: {type: string; image_url?: {url: string}}[]}[];
		};
		expect(body.model).toBe('openai/gpt-5-mini');
		expect(body.messages[1]!.content[0]).toEqual({
			type: 'image_url',
			image_url: {url: 'data:image/png;base64,iVBORw0KGgo='},
		});
	});

	it('reads a scene answer: a tsx block plus a json props block', async () => {
		const reply = `Here you go.\n\`\`\`tsx\n${SCENE_TEMPLATES.hook}\`\`\`\n\`\`\`json\n{"title": "FernPay", "subtitle": "Payments"}\n\`\`\``;
		const {result} = await llm(fakeFetch([answer(reply)])).complete({
			role: 'sceneCoder',
			data: {brief: {}, research: copy, theme: {}, ratio: '16:9'},
		});
		expect(result).toEqual({code: SCENE_TEMPLATES.hook.trim(), props: {title: 'FernPay', subtitle: 'Payments'}});
	});

	it('asks once for a repair, with the exact problems, when an answer does not fit', async () => {
		const fetch = fakeFetch([answer('Sure! {"productName": "FernPay"}'), answer(JSON.stringify(copy))]);
		const {result, cost} = await llm(fetch).complete({role: 'research', data: {url: 'https://fernpay.io', site}});
		expect(result).toEqual(copy);
		expect(cost).toMatchObject({units: 3000, usdMicros: 8400});
		const repair = fetch.requests[1]!.body as {messages: {content: {text?: string}[]}[]};
		expect(repair.messages[1]!.content.at(-1)!.text).toMatch(/could not be used[\s\S]*tagline/);
	});

	it('gives up after the repair also fails, so the pipeline retries the step', async () => {
		const fetch = fakeFetch([answer('no json here'), answer('still nothing')]);
		await expect(
			llm(fetch).complete({role: 'research', data: {url: 'https://fernpay.io', site}}),
		).rejects.toMatchObject({
			name: 'ProviderError',
			retryable: true,
		});
	});

	it('treats an empty answer as a retryable failure', async () => {
		const fetch = fakeFetch([json({choices: [{message: {content: ''}, finish_reason: 'length'}]})]);
		await expect(llm(fetch).complete({role: 'research', data: {url: 'https://fernpay.io', site}})).rejects.toThrow(
			/empty answer \(length\)/,
		);
	});
});

describe('answer parsing', () => {
	it('finds JSON with or without fences and prose', () => {
		expect(extractJson('```json\n{"a": 1}\n```')).toEqual({a: 1});
		expect(extractJson('Here it is: {"a": {"b": 2}} Hope that helps')).toEqual({a: {b: 2}});
		expect(() => extractJson('nothing')).toThrow(/no JSON object/);
	});

	it('requires a tsx block; props default to empty', () => {
		expect(extractScene('```tsx\nexport default () => null;\n```')).toEqual({
			code: 'export default () => null;',
			props: {},
		});
		expect(() => extractScene('```json\n{}\n```')).toThrow(/no ```tsx block/);
	});
});

describe('checkModels (startup)', () => {
	const catalog = () =>
		json({
			data: [
				{id: 'anthropic/claude-sonnet-5', architecture: {input_modalities: ['text', 'image']}},
				{id: 'deepseek/deepseek-chat:free', architecture: {input_modalities: ['text']}},
			],
		});

	it('accepts models that exist, with images where needed', async () => {
		const problems = await checkModels(
			[
				{key: 'LLM_MODEL_DEFAULT', model: 'deepseek/deepseek-chat:free'},
				{key: 'LLM_MODEL_VISUAL_QA', model: 'anthropic/claude-sonnet-5', needsImages: true},
				{key: 'LLM_MODEL_FALLBACK', model: '~anthropic/claude-sonnet-latest'},
			],
			fakeFetch([catalog()]),
		);
		expect(problems).toEqual([]);
	});

	it('reports unknown models, a QA model without vision, and an unreachable catalog', async () => {
		const problems = await checkModels(
			[
				{key: 'LLM_MODEL_DIRECTOR', model: 'anthropic/claude-typo'},
				{key: 'LLM_MODEL_VISUAL_QA', model: 'deepseek/deepseek-chat:free', needsImages: true},
			],
			fakeFetch([catalog()]),
		);
		expect(problems).toEqual([
			'LLM_MODEL_DIRECTOR: "anthropic/claude-typo" is not an OpenRouter model',
			'LLM_MODEL_VISUAL_QA: "deepseek/deepseek-chat:free" does not accept images (the visual-QA role looks at stills)',
		]);
		expect(await checkModels([], fakeFetch([json({}, 503)]))).toEqual(['could not list OpenRouter models (HTTP 503)']);
	});
});

describe('checkVoices (startup)', () => {
	const speech = () =>
		json({
			data: [
				{id: 'deepgram/flux-tts:free', supported_voices: ['flux-marcus-en', 'flux-hannah-en']},
				{id: 'x/any-voice'},
			],
		});

	it('accepts voices the model supports, and models that list none', async () => {
		expect(
			await checkVoices(
				'deepgram/flux-tts:free',
				{sam: 'flux-marcus-en', kira: 'flux-hannah-en'},
				fakeFetch([speech()]),
			),
		).toEqual([]);
		expect(await checkVoices('x/any-voice', {sam: 'whatever'}, fakeFetch([speech()]))).toEqual([]);
	});

	it('names the wrong voices and lists the valid ones', async () => {
		const [problem] = await checkVoices(
			'deepgram/flux-tts:free',
			{sam: 'ash', kira: 'flux-hannah-en'},
			fakeFetch([speech()]),
		);
		expect(problem).toBe(
			'TTS_VOICES: sam=ash not supported by deepgram/flux-tts:free. Supported: flux-marcus-en, flux-hannah-en',
		);
		expect(await checkVoices('nope/tts', {}, fakeFetch([speech()]))).toEqual([
			'TTS_MODEL: "nope/tts" is not an OpenRouter voice model',
		]);
		expect(await checkVoices('x', {}, fakeFetch([json({}, 500)]))).toEqual([
			'could not list OpenRouter voice models (HTTP 500)',
		]);
	});
});
