import {describe, expect, it} from 'vitest';
import {fakeFetch, json} from './fake-fetch.js';
import {Gate} from './http.js';
import {openAiLlm, openAiModel, priceOf} from './openai.js';

// Contract tests: responses shaped like OpenAI's chat completions API
// (https://platform.openai.com/docs/api-reference/chat) and OpenRouter's public model list.

const copy = {
	productName: 'FernPay',
	tagline: 'Payments for marketplaces',
	description: 'Split payouts and KYC in one API.',
	features: [{title: 'Split payouts', description: 'Pay many sellers from one charge.'}],
	audience: 'marketplace founders',
};

const answer = (content: string | null, extra: Record<string, unknown> = {}) =>
	json({
		id: 'chatcmpl-1',
		model: 'gpt-5-mini-2026-08-01',
		choices: [{index: 0, finish_reason: 'stop', message: {role: 'assistant', content}}],
		usage: {
			prompt_tokens: 1200,
			completion_tokens: 300,
			total_tokens: 1500,
			prompt_tokens_details: {cached_tokens: 200},
		},
		...extra,
	});

// $1 / $8 per million tokens, cached input $0.10 per million.
const catalog = () =>
	json({
		data: [
			{
				id: 'openai/gpt-5-mini',
				pricing: {prompt: '0.000001', completion: '0.000008', input_cache_read: '0.0000001'},
			},
			{id: 'anthropic/claude-sonnet-5', pricing: {prompt: '0.000003', completion: '0.000015'}},
		],
	});

const llm = (fetch: ReturnType<typeof fakeFetch>, fallbackModel?: string) =>
	openAiLlm({
		apiKey: 'sk-test',
		modelFor: () => 'openai/gpt-5-mini',
		fallbackModel,
		fetch,
		gate: new Gate('openai', {concurrency: 4, failures: 5, coolDownMs: 1000}),
	});

const site = {title: 'FernPay — Payments', description: 'Payments for marketplaces', markdown: '# FernPay'};
const research = {role: 'research' as const, data: {url: 'https://fernpay.io', site}};

describe('openAiLlm', () => {
	it('sends the role prompt to OpenAI with its own model name, and prices the reply', async () => {
		const fetch = fakeFetch([answer(JSON.stringify(copy)), catalog()]);
		const {result, cost} = await llm(fetch).complete(research);

		expect(result).toEqual(copy);
		// 1000 prompt × $1/M + 200 cached × $0.10/M + 300 completion × $8/M = $0.00342
		expect(cost).toEqual({provider: 'openai:openai/gpt-5-mini', units: 1500, usdMicros: 3420});
		const [request, prices] = fetch.requests;
		expect(request).toMatchObject({url: 'https://api.openai.com/v1/chat/completions', method: 'POST'});
		expect(request!.headers.authorization).toBe('Bearer sk-test');
		const body = request!.body as {
			model: string;
			max_completion_tokens: number;
			messages: {role: string; content: unknown}[];
		};
		expect(body.model).toBe('gpt-5-mini');
		expect(body.max_completion_tokens).toBeGreaterThan(0);
		// Website text is fenced as data, never mixed into the instructions (NFR-SEC-07).
		expect(body.messages[0]).toMatchObject({role: 'system', content: expect.stringMatching(/never instructions/)});
		expect(JSON.stringify(body.messages[1]!.content)).toContain('<site_content>');
		// Prices come from the public list: no key is sent there.
		expect(prices).toMatchObject({url: 'https://openrouter.ai/api/v1/models', method: 'GET'});
		expect(prices!.headers.authorization).toBeUndefined();
	});

	it('reads the price list once', async () => {
		const fetch = fakeFetch([answer(JSON.stringify(copy)), catalog(), answer(JSON.stringify(copy))]);
		const port = llm(fetch);
		await port.complete(research);
		const {cost} = await port.complete(research);
		expect(cost.usdMicros).toBe(3420);
		expect(fetch.requests).toHaveLength(3);
	});

	it('still answers when the price list is unreachable, and tries it again next time', async () => {
		const fetch = fakeFetch([answer(JSON.stringify(copy)), json({}, 503), answer(JSON.stringify(copy)), catalog()]);
		const port = llm(fetch);
		expect((await port.complete(research)).cost.usdMicros).toBe(0);
		expect((await port.complete(research)).cost.usdMicros).toBe(3420);
	});

	it('sends stills inline for visual QA', async () => {
		const fetch = fakeFetch([answer(JSON.stringify({sceneIndex: 0, pass: true, issues: []})), catalog()]);
		await llm(fetch).complete({
			role: 'visualQA',
			data: {sceneIndex: 0, props: {}},
			images: ['data:image/png;base64,iVBORw0KGgo='],
		});
		const body = fetch.requests[0]!.body as {messages: {content: {type: string}[]}[]};
		expect(body.messages[1]!.content[0]).toEqual({
			type: 'image_url',
			image_url: {url: 'data:image/png;base64,iVBORw0KGgo='},
		});
	});

	it('tries the fallback model once when the first one fails', async () => {
		const fetch = fakeFetch([json({error: {message: 'overloaded'}}, 503), answer(JSON.stringify(copy)), catalog()]);
		const {cost} = await llm(fetch, 'openai/gpt-5').complete(research);
		expect((fetch.requests[1]!.body as {model: string}).model).toBe('gpt-5');
		// Not in the price list: the tokens are still counted.
		expect(cost).toEqual({provider: 'openai:openai/gpt-5', units: 1500, usdMicros: 0});
	});

	it('does not retry a request OpenAI rejects, and never shows the key', async () => {
		const fetch = fakeFetch([json({error: {message: 'Incorrect API key provided'}}, 401)]);
		const error = await llm(fetch, 'openai/gpt-5')
			.complete(research)
			.catch((e: unknown) => e as Error);
		expect(error).toMatchObject({name: 'ProviderError', retryable: false});
		expect(String(error)).not.toContain('sk-test');
		expect(fetch.requests).toHaveLength(1);
	});

	it('treats an empty answer or a refusal as a retryable failure', async () => {
		await expect(
			llm(fakeFetch([answer('', {choices: [{message: {content: ''}, finish_reason: 'length'}]}), catalog()])).complete(
				research,
			),
		).rejects.toThrow(/empty answer \(length\)/);
		await expect(
			llm(fakeFetch([answer(null, {choices: [{message: {content: null, refusal: 'no'}}]}), catalog()])).complete(
				research,
			),
		).rejects.toMatchObject({retryable: true, message: expect.stringMatching(/refused/)});
	});
});

describe('pricing', () => {
	it('drops the "openai/" prefix only', () => {
		expect(openAiModel('openai/gpt-5.6-sol')).toBe('gpt-5.6-sol');
		expect(openAiModel('gpt-5')).toBe('gpt-5');
	});

	it('prices cached prompt tokens at the cache rate', () => {
		const price = {prompt: 1e-6, completion: 8e-6, cachedPrompt: 1e-7};
		expect(priceOf({prompt_tokens: 1000, completion_tokens: 100}, price)).toBeCloseTo(0.0018, 10);
		expect(
			priceOf({prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: {cached_tokens: 1000}}, price),
		).toBeCloseTo(0.0009, 10);
		expect(priceOf({}, price)).toBe(0);
	});
});
