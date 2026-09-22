import {
	applyAnswer,
	describeAnswer,
	EMPTY_SETTINGS,
	followUp,
	introMessages,
	isComplete,
	parseDesignMd,
	SetupError,
} from '@kinetiq/domain';
import {
	CreateBrandKitRequest,
	CreateProjectRequest,
	PageQuery,
	SendMessageRequest,
	VIDEO_MODELS,
	type BrandKitResponse,
	type ProjectDetailResponse,
} from '@kinetiq/shared';
import {Router} from 'express';
import type {Container} from '../container.js';
import {AppError, notFound} from '../errors.js';
import {idempotent} from '../middleware/idempotency.js';
import {requireAuth} from '../middleware/session.js';

// Projects, chat and brand kits (docs/API.md §4, §5, §11).

const SETUP_STATUSES = new Set(['setup', 'ready']);

export function projectRoutes({repos, locks, storage}: Container): Router {
	const router = Router();
	router.use(['/projects', '/brand-kits'], requireAuth);

	// ── Projects ──────────────────────────────────────────────────────────────
	router.post('/projects', async (req, res) => {
		const userId = req.auth!.userId;
		const input = CreateProjectRequest.parse(req.body);
		if (input.model && !VIDEO_MODELS[input.model].enabled) {
			throw new AppError('FORBIDDEN', 'AI cinematic clips are not available yet.');
		}
		if (input.templateId && !(await repos.templates.isPublished(input.templateId))) {
			throw new AppError('VALIDATION_ERROR', 'Unknown template', {fields: {templateId: 'not found'}});
		}
		if (!(await repos.assets.allUsable(userId, input.assetIds))) {
			throw new AppError('VALIDATION_ERROR', 'Some attachments are not ready or not yours', {
				fields: {assetIds: 'every attachment must be uploaded, checked and unused'},
			});
		}
		const project = await repos.projects.create(userId, input);
		for (const message of introMessages({hasAssets: input.assetIds.length > 0, hasPrompt: Boolean(input.prompt)})) {
			await repos.messages.append(userId, project.id, {role: 'assistant', ...message});
		}
		res.status(201).json({project});
	});

	router.get('/projects', async (req, res) => {
		res.json(await repos.projects.list(req.auth!.userId, PageQuery.parse(req.query)));
	});

	router.get('/projects/:projectId', async (req, res) => {
		const userId = req.auth!.userId;
		const project = await repos.projects.get(userId, String(req.params.projectId));
		if (!project) throw notFound('Project not found');
		const [versions, activeJob] = await Promise.all([
			repos.versions.list(userId, project.id, {limit: 1}),
			repos.jobs.getActiveForProject(userId, project.id),
		]);
		const body: ProjectDetailResponse = {project, latestVersion: versions.items[0] ?? null, activeJob};
		res.json(body);
	});

	router.delete('/projects/:projectId', async (req, res) => {
		const userId = req.auth!.userId;
		const projectId = String(req.params.projectId);
		if (await repos.jobs.hasActiveForProject(userId, projectId)) {
			// Cancelling (with refund) arrives in Phase 6; until then a running project can't be deleted.
			throw new AppError('CONFLICT', 'Cancel the running job before deleting this project');
		}
		if (!(await repos.projects.delete(userId, projectId))) throw notFound('Project not found');
		res.status(204).end();
	});

	// ── Chat ──────────────────────────────────────────────────────────────────
	router.get('/projects/:projectId/messages', async (req, res) => {
		const userId = req.auth!.userId;
		const projectId = String(req.params.projectId);
		if (!(await repos.projects.get(userId, projectId))) throw notFound('Project not found');
		res.json(await repos.messages.list(userId, projectId, PageQuery.parse(req.query)));
	});

	router.post('/projects/:projectId/messages', idempotent(repos.idempotency, locks), async (req, res) => {
		const userId = req.auth!.userId;
		const input = SendMessageRequest.parse(req.body);
		const project = await repos.projects.get(userId, String(req.params.projectId));
		if (!project) throw notFound('Project not found');

		let settings = project.settings;
		if (input.answer) {
			if (!SETUP_STATUSES.has(project.status)) {
				throw new AppError('CONFLICT', 'Setup answers can only change before the video is generated');
			}
			if (input.answer.key === 'design' && input.answer.value.kind === 'brandKit') {
				if (!(await repos.brandKits.get(userId, input.answer.value.brandKitId))) {
					throw new AppError('VALIDATION_ERROR', 'Unknown DESIGN.md', {
						fields: {'answer.value.brandKitId': 'not found'},
					});
				}
			}
			try {
				settings = applyAnswer(settings ?? EMPTY_SETTINGS, input.answer);
			} catch (error) {
				if (error instanceof SetupError) throw new AppError('CONFLICT', error.message);
				throw error;
			}
			await repos.projects.updateSettings(userId, project.id, settings);
		}

		const message = await repos.messages.append(userId, project.id, {
			role: 'user',
			content: input.content ?? describeAnswer(input.answer!),
		});

		if (SETUP_STATUSES.has(project.status)) {
			// Deterministic reply (FR-GEN-13): the next question, or "all set".
			await repos.messages.append(userId, project.id, {role: 'assistant', ...followUp(settings)});
			const status = isComplete(settings) ? 'ready' : 'setup';
			if (status !== project.status) await repos.projects.setStatus(userId, project.id, status);
		}
		// After a video exists, free text becomes an edit request (Phase 10).
		res.status(201).json({message, jobId: null});
	});

	// ── Brand kits (DESIGN.md) ────────────────────────────────────────────────
	router.post('/brand-kits', async (req, res) => {
		const userId = req.auth!.userId;
		const input = CreateBrandKitRequest.parse(req.body);
		let designMd: string;
		if ('designMd' in input) {
			designMd = input.designMd;
		} else {
			const asset = await repos.assets.getForUpload(userId, input.assetId);
			if (!asset || asset.status !== 'ready' || asset.kind !== 'designMd') {
				throw new AppError('VALIDATION_ERROR', 'Upload a DESIGN.md file first', {
					fields: {assetId: 'not a ready DESIGN.md'},
				});
			}
			designMd = new TextDecoder().decode(await storage.readStart(asset.storageKey, asset.size));
		}
		const {tokens} = parseDesignMd(designMd);
		const kit = await repos.brandKits.create(userId, designMd, tokens);
		const body: BrandKitResponse = {brandKit: {id: kit.id, tokens: kit.tokens}};
		res.status(201).json(body);
	});

	return router;
}
