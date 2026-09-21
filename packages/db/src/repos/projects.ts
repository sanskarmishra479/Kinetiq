import {
	DesignTokens,
	MessageUi,
	ProjectSettings,
	type CreateProjectRequest,
	type Message,
	type PageQuery,
	type Project,
} from '@kinetiq/shared';
import type {z} from 'zod';
import type {Message as MessageRow, Project as ProjectRow} from '../generated/prisma/client.js';
import {iso, json, nullableJson, paginate, type RepoDeps} from './shared.js';

// Projects, chat messages and brand kits. Every read and write is scoped by
// userId: another user's rows are simply "not found" (NFR-SEC-08, FR-PRJ-03).

type Settings = z.infer<typeof ProjectSettings>;

function toProject(row: ProjectRow): Project {
	return {
		id: row.id,
		status: row.status,
		url: row.url,
		durationSec: row.durationSec as Project['durationSec'],
		ratio: row.ratio as Project['ratio'],
		model: row.model as Project['model'],
		templateId: row.templateId,
		prompt: row.prompt,
		settings: ProjectSettings.parse(row.settings),
		createdAt: iso(row.createdAt),
		updatedAt: iso(row.updatedAt),
	};
}

function toMessage(row: MessageRow): Message {
	return {
		id: row.id,
		role: row.role,
		content: row.content,
		...(row.ui === null ? {} : {ui: MessageUi.parse(row.ui)}),
		createdAt: iso(row.createdAt),
	};
}

export function projectsRepo({db, ids, clock}: RepoDeps) {
	return {
		/** `input` must already be parsed with CreateProjectRequest; asset ownership is checked by the caller. */
		async create(userId: string, input: CreateProjectRequest): Promise<Project> {
			const now = new Date(clock.now());
			// One transaction: the project and its attachments are saved together or not at all.
			const row = await db.$transaction(async (tx) => {
				const created = await tx.project.create({
					data: {
						id: ids.next('prj'),
						userId,
						url: input.url,
						durationSec: input.durationSec,
						ratio: input.ratio,
						model: input.model ?? null,
						templateId: input.templateId ?? null,
						prompt: input.prompt ?? null,
						createdAt: now,
						updatedAt: now,
					},
				});
				if (input.assetIds.length > 0) {
					await tx.asset.updateMany({
						where: {id: {in: input.assetIds}, userId, projectId: null},
						data: {projectId: created.id},
					});
				}
				return created;
			});
			return toProject(row);
		},

		async get(userId: string, projectId: string): Promise<Project | null> {
			const row = await db.project.findFirst({where: {id: projectId, userId}});
			return row ? toProject(row) : null;
		},

		list(userId: string, page: PageQuery) {
			return paginate(
				(args) => db.project.findMany({where: {userId, ...args.where}, orderBy: {id: 'desc'}, take: args.take}),
				page,
				toProject,
			);
		},

		async updateSettings(userId: string, projectId: string, settings: Settings): Promise<Project | null> {
			const valid = ProjectSettings.parse(settings);
			const {count} = await db.project.updateMany({
				where: {id: projectId, userId},
				data: {settings: json(valid), updatedAt: new Date(clock.now())},
			});
			return count === 0 ? null : this.get(userId, projectId);
		},

		/** Returns false when the project doesn't exist or isn't this user's. */
		async delete(userId: string, projectId: string): Promise<boolean> {
			const {count} = await db.project.deleteMany({where: {id: projectId, userId}});
			return count > 0;
		},
	};
}

export function messagesRepo({db, ids, clock}: RepoDeps) {
	return {
		/** Returns null when the project isn't this user's. */
		async append(
			userId: string,
			projectId: string,
			message: {role: Message['role']; content: string; ui?: z.infer<typeof MessageUi>},
		): Promise<Message | null> {
			const owned = await db.project.findFirst({where: {id: projectId, userId}, select: {id: true}});
			if (!owned) return null;
			const row = await db.message.create({
				data: {
					id: ids.next('msg'),
					projectId,
					userId,
					role: message.role,
					content: message.content,
					ui: nullableJson(message.ui === undefined ? null : MessageUi.parse(message.ui)),
					createdAt: new Date(clock.now()),
				},
			});
			return toMessage(row);
		},

		list(userId: string, projectId: string, page: PageQuery) {
			return paginate(
				(args) =>
					db.message.findMany({where: {projectId, userId, ...args.where}, orderBy: {id: 'desc'}, take: args.take}),
				page,
				toMessage,
			);
		},
	};
}

export function brandKitsRepo({db, ids, clock}: RepoDeps) {
	return {
		async create(userId: string, designMd: string, tokens: z.infer<typeof DesignTokens>) {
			const row = await db.brandKit.create({
				data: {
					id: ids.next('bk'),
					userId,
					designMd,
					tokens: json(DesignTokens.parse(tokens)),
					createdAt: new Date(clock.now()),
				},
			});
			return {id: row.id, tokens: DesignTokens.parse(row.tokens)};
		},

		async get(userId: string, brandKitId: string) {
			const row = await db.brandKit.findFirst({where: {id: brandKitId, userId}});
			return row ? {id: row.id, designMd: row.designMd, tokens: DesignTokens.parse(row.tokens)} : null;
		},
	};
}
