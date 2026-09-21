import {describe, expect, it} from 'vitest';
import {accepts, ids, now, rejects} from '../test-helpers.js';
import {CreateProjectRequest, DesignChoice, Project} from './projects.js';

// SRS § 4.2 (FR-PRJ-01, 02, 04).
const base = {url: 'https://acme.com', durationSec: 30, ratio: '16:9'};

describe('CreateProjectRequest', () => {
	it('accepts the minimum and applies defaults', () => {
		expect(accepts(CreateProjectRequest, base)).toEqual({...base, assetIds: []});
	});

	it('accepts every optional field', () => {
		accepts(CreateProjectRequest, {
			...base,
			model: 'veo',
			templateId: ids.template,
			assetIds: [ids.asset, ids.asset2],
			prompt: 'Focus on AI search',
		});
		accepts(CreateProjectRequest, {...base, model: null, templateId: null, prompt: null});
	});

	it('rejects a non-https or internal URL', () => {
		rejects(CreateProjectRequest, {...base, url: 'http://acme.com'});
		rejects(CreateProjectRequest, {...base, url: 'https://localhost'});
	});

	it('rejects unsupported durations, ratios and models', () => {
		rejects(CreateProjectRequest, {...base, durationSec: 60});
		rejects(CreateProjectRequest, {...base, ratio: '4:3'});
		rejects(CreateProjectRequest, {...base, model: 'sora'});
	});

	it('allows at most 10 unique attachments', () => {
		const eleven = Array.from({length: 11}, (_, i) => `ast_file${String(i).padStart(4, '0')}`);
		rejects(CreateProjectRequest, {...base, assetIds: eleven}, 'at most 10 attachments');
		rejects(CreateProjectRequest, {...base, assetIds: [ids.asset, ids.asset]}, 'must be unique');
		rejects(CreateProjectRequest, {...base, assetIds: [ids.job]});
	});

	it('bounds the prompt', () => {
		rejects(CreateProjectRequest, {...base, prompt: 'x'.repeat(2001)});
	});

	it('rejects unknown fields (no mass assignment)', () => {
		rejects(CreateProjectRequest, {...base, userId: ids.user});
		rejects(CreateProjectRequest, {...base, status: 'done'});
	});
});

describe('Project', () => {
	it('accepts a full project', () => {
		accepts(Project, {
			id: ids.project,
			status: 'setup',
			url: 'https://acme.com',
			durationSec: 30,
			ratio: '9:16',
			model: null,
			templateId: null,
			prompt: null,
			settings: {
				voiceover: {enabled: true, voiceId: 'kira', language: 'en', scriptBy: 'ai'},
				design: {kind: 'preset', presetId: 'dark-cinematic'},
			},
			createdAt: now,
			updatedAt: now,
		});
	});

	it('requires the matching field for each design choice', () => {
		accepts(DesignChoice, {kind: 'auto'});
		accepts(DesignChoice, {kind: 'brandKit', brandKitId: ids.brandKit});
		rejects(DesignChoice, {kind: 'preset'});
		rejects(DesignChoice, {kind: 'preset', presetId: 'apple'});
	});
});
