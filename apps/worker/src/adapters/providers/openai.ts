import type {LlmPort, LlmRequest, ProviderCost} from '../../ports.js';
import {chatLlm, type ChatContent} from './chat.js';
import {call, Gate, ProviderError, type Fetch} from './http.js';

// Language models straight from OpenAI (LLM_PROVIDER=openai, docs/ARCHITECTURE.md §5.1).
// For development without OpenRouter credit: same prompts, parsing and repair
// round as OpenRouter (chat.ts). Models keep OpenRouter's names ("openai/gpt-…")
// so switching back is one setting; the "openai/" prefix is dropped here.
// OpenAI's reply has token counts but no price, so prices per token come from
// OpenRouter's public model list (same prices, no key needed).

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const CATALOG = 'https://openrouter.ai/api/v1/models';

export type OpenAiOptions = {
	apiKey: string;
	/** The model for a role, OpenRouter-style ("openai/gpt-5-mini"). */
	modelFor: (role: LlmRequest['role']) => string;
	/** Tried once when the first model fails with a retryable error. */
	fallbackModel?: string | undefined;
	fetch?: Fetch;
	timeoutMs?: number;
	gate?: Gate;
};

type OpenAiResponse = {
	model?: string;
	choices?: {message?: {content?: string | null; refusal?: string | null}; finish_reason?: string | null}[];
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
		prompt_tokens_details?: {cached_tokens?: number};
	};
};

/** Dollars per token. */
export type Price = {prompt: number; completion: number; cachedPrompt: number};

/** Dollars for one reply: cached prompt tokens at the cache price, the rest at the normal prices. */
export function priceOf(usage: NonNullable<OpenAiResponse['usage']>, price: Price): number {
	const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
	const prompt = (usage.prompt_tokens ?? 0) - cached;
	return prompt * price.prompt + cached * price.cachedPrompt + (usage.completion_tokens ?? 0) * price.completion;
}

/** OpenAI's name for an OpenRouter model id. */
export const openAiModel = (model: string) => model.replace(/^openai\//, '');

export function openAiLlm(options: OpenAiOptions): LlmPort {
	const fetch = options.fetch ?? globalThis.fetch;
	const gate = options.gate ?? new Gate('openai', {concurrency: 8, failures: 5, coolDownMs: 30_000});
	const http = {provider: 'openai', fetch, timeoutMs: options.timeoutMs ?? 180_000, gate};

	// Loaded once. If the list can't be read, the call still succeeds and the
	// next one tries again; that call's cost is recorded as 0.
	let prices: Promise<Map<string, Price>> | null = null;
	async function priceFor(model: string): Promise<Price | undefined> {
		prices ??= loadPrices(fetch);
		try {
			return (await prices).get(model);
		} catch {
			prices = null;
			return undefined;
		}
	}

	async function once(model: string, system: string, content: ChatContent[], maxTokens: number) {
		const response = await call(http, ENDPOINT, {
			method: 'POST',
			headers: {authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json'},
			body: JSON.stringify({
				model: openAiModel(model),
				messages: [
					{role: 'system', content: system},
					{role: 'user', content},
				],
				// Newer models take max_completion_tokens (it includes reasoning tokens).
				max_completion_tokens: maxTokens,
			}),
		});
		const body = (await response.json()) as OpenAiResponse;
		const choice = body.choices?.[0];
		const usage = body.usage ?? {};
		const price = await priceFor(model);
		const cost: ProviderCost = {
			provider: `openai:${model}`,
			units: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
			usdMicros: price ? Math.round(priceOf(usage, price) * 1_000_000) : 0,
		};
		const text = choice?.message?.content ?? '';
		if (!text) {
			const why = choice?.message?.refusal ? 'refused' : (choice?.finish_reason ?? 'no reason');
			throw new ProviderError('openai', null, `empty answer (${why})`, true);
		}
		return {text, cost};
	}

	return chatLlm('openai', options.modelFor, async (model, system, content, maxTokens) => {
		try {
			return await once(model, system, content, maxTokens);
		} catch (error) {
			const fallback = options.fallbackModel;
			if (!fallback || fallback === model || !(error instanceof ProviderError) || !error.retryable) throw error;
			return once(fallback, system, content, maxTokens);
		}
	});
}

/** Per-token prices of OpenAI models, from OpenRouter's public list. */
async function loadPrices(fetch: Fetch): Promise<Map<string, Price>> {
	const response = await fetch(CATALOG, {signal: AbortSignal.timeout(20_000)});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const {data} = (await response.json()) as {
		data?: {id: string; pricing?: {prompt?: string; completion?: string; input_cache_read?: string}}[];
	};
	const map = new Map<string, Price>();
	for (const {id, pricing} of data ?? []) {
		if (!id.startsWith('openai/') || !pricing) continue;
		const prompt = Number(pricing.prompt ?? 0);
		map.set(id, {
			prompt,
			completion: Number(pricing.completion ?? 0),
			cachedPrompt: pricing.input_cache_read ? Number(pricing.input_cache_read) : prompt,
		});
	}
	return map;
}
