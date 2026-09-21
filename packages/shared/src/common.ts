import {z} from 'zod';

// Building blocks reused by every contract in this package.

// ── IDs ──────────────────────────────────────────────────────────────────────
// Opaque, prefixed ids ("prj_01j9…"). The prefix tells you the type at a glance
// and stops ids of one kind being accepted where another is expected.
export const ID_PREFIXES = {
	user: 'usr',
	project: 'prj',
	message: 'msg',
	job: 'job',
	version: 'ver',
	scene: 'scn',
	asset: 'ast',
	template: 'tpl',
	brandKit: 'bk',
	bucket: 'bkt',
	ledger: 'led',
	clip: 'clp',
} as const;

export type IdKind = keyof typeof ID_PREFIXES;

export const idSchema = (kind: IdKind) =>
	z.string().regex(new RegExp(`^${ID_PREFIXES[kind]}_[0-9A-Za-z]{8,40}$`), `must be a ${kind} id`);

export const UserId = idSchema('user');
export const ProjectId = idSchema('project');
export const MessageId = idSchema('message');
export const JobId = idSchema('job');
export const VersionId = idSchema('version');
export const AssetId = idSchema('asset');
export const TemplateId = idSchema('template');
export const BrandKitId = idSchema('brandKit');
export const BucketId = idSchema('bucket');
export const LedgerId = idSchema('ledger');
export const ClipId = idSchema('clip');

// ── Scalars ──────────────────────────────────────────────────────────────────
export const Timestamp = z.iso.datetime();
export const Credits = z.int().min(0);
/** A signed credit change (ledger entries can be negative). */
export const CreditDelta = z.int();

export const DURATIONS = [15, 30, 45] as const;
export const Duration = z.union([z.literal(15), z.literal(30), z.literal(45)]);
export type Duration = z.infer<typeof Duration>;

export const RATIOS = ['16:9', '9:16', '1:1'] as const;
export const Ratio = z.enum(RATIOS);
export type Ratio = z.infer<typeof Ratio>;

export const HexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'must be a hex color');

// ── Public website URL (user input) ──────────────────────────────────────────
// Only public https websites. We never fetch these ourselves (Firecrawl does,
// NFR-SEC-05), but rejecting internal targets here is cheap defense in depth.
const MAX_URL_LENGTH = 2048;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.corp'];

export function publicUrlProblem(raw: string): string | null {
	if (raw.length > MAX_URL_LENGTH) return 'is too long';
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return 'is not a valid URL';
	}
	if (url.protocol !== 'https:') return 'must start with https://';
	if (url.username || url.password) return 'must not contain credentials';
	if (url.port && url.port !== '443') return 'must not use a custom port';
	const host = url.hostname.toLowerCase();
	if (host.startsWith('[') || IPV4.test(host)) return 'must use a domain name, not an IP address';
	if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return 'must be a public website';
	if (!host.includes('.')) return 'must be a public website';
	return null;
}

export const PublicUrl = z
	.string()
	.trim()
	.superRefine((value, ctx) => {
		const problem = publicUrlProblem(value);
		if (problem) ctx.addIssue({code: 'custom', message: `URL ${problem}`});
	});

// ── Pagination ───────────────────────────────────────────────────────────────
export const PageQuery = z.strictObject({
	limit: z.coerce.number().int().min(1).max(100).default(20),
	cursor: z.string().min(1).max(200).optional(),
});
export type PageQuery = z.infer<typeof PageQuery>;

export const page = <T extends z.ZodType>(item: T) =>
	z.object({
		items: z.array(item),
		nextCursor: z.string().nullable(),
	});

export const SignedUrl = z.object({
	url: z.url(),
	expiresAt: Timestamp,
});
export type SignedUrl = z.infer<typeof SignedUrl>;
