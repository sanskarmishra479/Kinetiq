import {memoryStorage} from '@kinetiq/platform';
import {loadConfig} from '@kinetiq/shared';
import {describe, expect, it} from 'vitest';
import {modelsToCheck, realProviders} from './container.js';

const base = {
	WEB_ORIGIN: 'http://localhost:3000',
	API_ORIGIN: 'http://localhost:4000',
	CONTENT_ORIGIN: 'http://localhost:9000',
	PUBLIC_CDN_ORIGIN: 'http://localhost:9000',
	DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
	REDIS_URL: 'redis://localhost:6379',
	S3_ENDPOINT: 'http://localhost:9000',
	S3_ACCESS_KEY_ID: 'x',
	S3_SECRET_ACCESS_KEY: 'x',
	S3_BUCKET_CONTENT: 'c',
	S3_BUCKET_PUBLIC: 'p',
	BETTER_AUTH_SECRET: 'x'.repeat(32),
	MOCK_PROVIDERS: 'false',
	OPENROUTER_API_KEY: 'or',
	FIRECRAWL_API_KEY: 'fc',
	TTS_PROVIDER: 'openrouter',
	TTS_MODEL: 'openai/gpt-4o-mini-tts',
	LLM_MODEL_DEFAULT: 'deepseek/deepseek-chat:free',
	LLM_MODEL_DIRECTOR: 'anthropic/claude-opus-5',
	LLM_MODEL_VISUAL_QA: 'anthropic/claude-sonnet-5',
};

describe('provider choice from the environment (NFR-MNT-05)', () => {
	it('builds the real providers and records the model per role', () => {
		const providers = realProviders(loadConfig(base), memoryStorage());
		expect(providers.models).toEqual({
			research: 'deepseek/deepseek-chat:free',
			designMd: 'deepseek/deepseek-chat:free',
			director: 'anthropic/claude-opus-5',
			sceneCoder: 'deepseek/deepseek-chat:free',
			sceneFix: 'deepseek/deepseek-chat:free',
			visualQA: 'anthropic/claude-sonnet-5',
		});
		expect(typeof providers.llm.complete).toBe('function');
		expect(typeof providers.voice.speak).toBe('function');
	});

	it('checks every configured model, and the QA model for images', () => {
		expect(modelsToCheck(loadConfig(base))).toEqual([
			{key: 'LLM_MODEL_DEFAULT', model: 'deepseek/deepseek-chat:free'},
			{key: 'LLM_MODEL_DIRECTOR', model: 'anthropic/claude-opus-5'},
			{key: 'LLM_MODEL_VISUAL_QA', model: 'anthropic/claude-sonnet-5'},
			{key: 'LLM_MODEL_VISUAL_QA (or default)', model: 'anthropic/claude-sonnet-5', needsImages: true},
		]);
	});
});
