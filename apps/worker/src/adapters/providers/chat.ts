import {PROMPT_VERSION, PROMPTS} from '../../prompts/index.js';
import type {Costed, LlmPort, LlmRequest, ProviderCost} from '../../ports.js';
import {ProviderError} from './http.js';

// What every chat-model provider shares (OpenRouter, OpenAI direct): the prompt
// per role, parsing and validating the answer against the role's schema, and
// one repair round with the exact errors when an answer doesn't fit.

export type ChatContent =
	{type: 'text'; text: string; cache_control?: {type: 'ephemeral'}} | {type: 'image_url'; image_url: {url: string}};

/** One call to a provider's chat endpoint. */
export type Ask = (
	model: string,
	system: string,
	content: ChatContent[],
	maxTokens: number,
) => Promise<{text: string; cost: ProviderCost}>;

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

/** An LlmPort over a provider's `ask`, for the model chosen per role. */
export function chatLlm(provider: string, modelFor: (role: LlmRequest['role']) => string, ask: Ask): LlmPort {
	return {
		async complete(request): Promise<Costed<unknown>> {
			const spec = PROMPTS[request.role];
			const model = request.model ?? modelFor(request.role);
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
				provider,
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
