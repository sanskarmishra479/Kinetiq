import {PROMPT_VERSION, PROMPTS} from '../../prompts/index.js';
import type {Costed, LlmPort, LlmRequest, ProviderCost} from '../../ports.js';
import {call, Gate, ProviderError, type Fetch} from './http.js';

// Language models through OpenRouter (docs/ARCHITECTURE.md §5.1).
// - The model is chosen per role from the environment (Claude, DeepSeek, free
//   models in development); a fallback model answers if the first one fails.
// - The long, unchanging system prompt is marked for caching on Claude models;
//   DeepSeek and others cache automatically.
// - Answers are parsed and validated against the role's schema. If an answer
//   doesn't match, the model is asked once to repair it, with the exact errors.

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export type OpenRouterOptions = {
	apiKey: string;
	/** The model for a role (from LLM_MODEL_<ROLE>, else LLM_MODEL_DEFAULT). */
	modelFor: (role: LlmRequest['role']) => string;
	fallbackModel?: string | undefined;
	fetch?: Fetch;
	timeoutMs?: number;
	gate?: Gate;
	/** Shown in OpenRouter's dashboard. */
	appUrl?: string;
};

type ChatContent =
	{type: 'text'; text: string; cache_control?: {type: 'ephemeral'}} | {type: 'image_url'; image_url: {url: string}};

type ChatResponse = {
	model?: string;
	choices?: {message?: {content?: string | null}; finish_reason?: string | null}[];
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
		/** What OpenRouter charged (0 with BYOK). */
		cost?: number;
		/** True when the account uses its own provider key: the provider bills it directly. */
		is_byok?: boolean;
		cost_details?: {upstream_inference_cost?: number | null};
	};
};

/**
 * The real price of a call. With "bring your own key" (BYOK) OpenRouter's own
 * charge is 0 and the provider bills the account directly: that part is in
 * cost_details.upstream_inference_cost, so both are counted.
 */
export function dollarsSpent(usage: NonNullable<ChatResponse['usage']>): number {
	const upstream = usage.is_byok ? (usage.cost_details?.upstream_inference_cost ?? 0) : 0;
	return (usage.cost ?? 0) + upstream;
}

/** Claude only caches blocks that are marked; other providers cache automatically. */
const marksCache = (model: string) => /^~?anthropic\//.test(model);

/** Pulls the JSON object out of an answer, tolerating code fences or a stray sentence around it. */
export function extractJson(text: string): unknown {
	const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
	const candidate = (fenced ?? text).trim();
	const start = candidate.indexOf('{');
	const end = candidate.lastIndexOf('}');
	if (start === -1 || end <= start) throw new SyntaxError('no JSON object in the answer');
	return JSON.parse(candidate.slice(start, end + 1));
}

/** Reads a scene answer: one ```tsx block and one ```json props block. */
export function extractScene(text: string): {code: string; props: unknown} {
	const code = /```(?:tsx|ts|jsx|typescript)\s*([\s\S]*?)```/i.exec(text)?.[1];
	if (!code) throw new SyntaxError('no ```tsx block in the answer');
	const props = /```json\s*([\s\S]*?)```/i.exec(text)?.[1];
	return {code: code.trim(), props: props ? JSON.parse(props) : {}};
}

export function openRouterLlm(options: OpenRouterOptions): LlmPort {
	const fetch = options.fetch ?? globalThis.fetch;
	const gate = options.gate ?? new Gate('openrouter', {concurrency: 8, failures: 5, coolDownMs: 30_000});
	const http = {provider: 'openrouter', fetch, timeoutMs: options.timeoutMs ?? 180_000, gate};

	async function ask(model: string, system: string, userContent: ChatContent[], maxTokens: number) {
		const response = await call(http, ENDPOINT, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${options.apiKey}`,
				'content-type': 'application/json',
				'x-title': 'Kinetiq',
				...(options.appUrl ? {'http-referer': options.appUrl} : {}),
			},
			body: JSON.stringify({
				model,
				// OpenRouter tries these in order when a model fails or is unavailable (NFR-REL-03).
				...(options.fallbackModel && options.fallbackModel !== model ? {models: [model, options.fallbackModel]} : {}),
				messages: [
					{
						role: 'system',
						content: [{type: 'text', text: system, ...(marksCache(model) ? {cache_control: {type: 'ephemeral'}} : {})}],
					},
					{role: 'user', content: userContent},
				],
				max_tokens: maxTokens,
			}),
		});
		const body = (await response.json()) as ChatResponse;
		const text = body.choices?.[0]?.message?.content ?? '';
		const usage = body.usage ?? {};
		const cost: ProviderCost = {
			provider: `openrouter:${body.model ?? model}`,
			units: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
			usdMicros: Math.round(dollarsSpent(usage) * 1_000_000),
		};
		if (!text)
			throw new ProviderError(
				'openrouter',
				null,
				`empty answer (${body.choices?.[0]?.finish_reason ?? 'no reason'})`,
				true,
			);
		return {text, cost};
	}

	return {
		async complete(request): Promise<Costed<unknown>> {
			const spec = PROMPTS[request.role];
			const model = request.model ?? options.modelFor(request.role);
			const content: ChatContent[] = [
				...(request.images ?? []).map((url) => ({type: 'image_url' as const, image_url: {url}})),
				{type: 'text', text: spec.user(request.data)},
			];

			const first = await ask(model, spec.system, content, spec.maxTokens);
			const parsed = parseAnswer(spec.output, spec.schema, first.text);
			if (parsed.ok) return {result: parsed.value, cost: first.cost};

			// One repair attempt with the exact problems, then give up (the node retries the whole step).
			const repair = await ask(
				model,
				spec.system,
				[
					...content,
					{
						type: 'text',
						text: `Your previous answer could not be used:\n${parsed.error}\n\nPrevious answer:\n${first.text.slice(0, 20_000)}\n\nAnswer again, following the required format exactly.`,
					},
				],
				spec.maxTokens,
			);
			const cost = {
				...repair.cost,
				units: first.cost.units + repair.cost.units,
				usdMicros: first.cost.usdMicros + repair.cost.usdMicros,
			};
			const second = parseAnswer(spec.output, spec.schema, repair.text);
			if (second.ok) return {result: second.value, cost};
			throw new ProviderError(
				'openrouter',
				null,
				`answer for ${request.role} did not match the required format (prompt ${PROMPT_VERSION})`,
				true,
			);
		},
	};
}

type Parsed = {ok: true; value: unknown} | {ok: false; error: string};

function parseAnswer(
	output: 'json' | 'scene',
	schema: {
		safeParse: (v: unknown) => {
			success: boolean;
			data?: unknown;
			error?: {issues: {path: PropertyKey[]; message: string}[]};
		};
	},
	text: string,
): Parsed {
	let raw: unknown;
	try {
		raw = output === 'scene' ? extractScene(text) : extractJson(text);
	} catch (error) {
		return {ok: false, error: (error as Error).message};
	}
	const result = schema.safeParse(raw);
	if (result.success) return {ok: true, value: result.data};
	const issues = (result.error?.issues ?? [])
		.slice(0, 10)
		.map((i) => `- ${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
		.join('\n');
	return {ok: false, error: `It did not match the schema:\n${issues}`};
}

/** A model as OpenRouter's catalog describes it (only the fields we check). */
export type ModelInfo = {id: string; architecture?: {input_modalities?: string[]}};

/**
 * Startup check (NFR-MNT-05): every configured model exists on OpenRouter, and
 * the visual-QA model accepts images. Returns the problems found (empty = fine).
 */
export async function checkModels(
	configured: {key: string; model: string; needsImages?: boolean}[],
	fetch: Fetch = globalThis.fetch,
): Promise<string[]> {
	const response = await fetch('https://openrouter.ai/api/v1/models', {signal: AbortSignal.timeout(20_000)});
	if (!response.ok) return [`could not list OpenRouter models (HTTP ${response.status})`];
	const {data} = (await response.json()) as {data?: ModelInfo[]};
	const byId = new Map((data ?? []).map((m) => [m.id, m]));
	const problems: string[] = [];
	for (const {key, model, needsImages} of configured) {
		// "~vendor/model" aliases resolve server-side; they can't be checked here.
		if (model.startsWith('~')) continue;
		const info = byId.get(model);
		if (!info) problems.push(`${key}: "${model}" is not an OpenRouter model`);
		else if (needsImages && !(info.architecture?.input_modalities ?? []).includes('image')) {
			problems.push(`${key}: "${model}" does not accept images (the visual-QA role looks at stills)`);
		}
	}
	return problems;
}

/**
 * Startup check for OpenRouter voice models: each of our 5 voices maps to a
 * voice the chosen model supports. On a mismatch, the message lists the valid
 * names so TTS_VOICES can be fixed.
 */
export async function checkVoices(
	model: string,
	mapping: Record<string, string>,
	fetch: Fetch = globalThis.fetch,
): Promise<string[]> {
	const response = await fetch('https://openrouter.ai/api/v1/models?output_modalities=speech', {
		signal: AbortSignal.timeout(20_000),
	});
	if (!response.ok) return [`could not list OpenRouter voice models (HTTP ${response.status})`];
	const {data} = (await response.json()) as {data?: {id: string; supported_voices?: string[]}[]};
	const info = (data ?? []).find((m) => m.id === model);
	if (!info) return [`TTS_MODEL: "${model}" is not an OpenRouter voice model`];
	const supported = info.supported_voices ?? [];
	if (supported.length === 0) return [];
	const wrong = Object.entries(mapping).filter(([, voice]) => !supported.includes(voice));
	return wrong.length === 0
		? []
		: [
				`TTS_VOICES: ${wrong.map(([ours, voice]) => `${ours}=${voice}`).join(', ')} not supported by ${model}. Supported: ${supported.join(', ')}`,
			];
}
