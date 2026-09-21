import {describe, expect, it} from 'vitest';
import {
	Duration,
	HexColor,
	idSchema,
	page,
	PageQuery,
	ProjectId,
	publicUrlProblem,
	PublicUrl,
	Ratio,
	SignedUrl,
} from './common.js';
import {accepts, ids, now, rejects} from './test-helpers.js';
import {z} from 'zod';

describe('ids', () => {
	it('accepts the right prefix only', () => {
		accepts(ProjectId, ids.project);
		rejects(ProjectId, ids.job, 'must be a project id');
		rejects(ProjectId, 'prj_');
		rejects(ProjectId, 'prj_short');
		rejects(ProjectId, 'prj_has space12');
		rejects(ProjectId, `prj_${'a'.repeat(41)}`);
	});

	it('builds a schema per kind', () => {
		accepts(idSchema('clip'), ids.clip);
		rejects(idSchema('clip'), ids.asset);
	});
});

describe('PublicUrl (user website URLs)', () => {
	it.each(['https://acme.com', 'https://www.acme.co.uk/pricing?x=1', 'https://app.acme.io:443/'])(
		'accepts %s',
		(url) => {
			accepts(PublicUrl, url);
		},
	);

	it('trims whitespace', () => {
		expect(accepts(PublicUrl, '  https://acme.com  ')).toBe('https://acme.com');
	});

	it.each([
		['http://acme.com', 'must start with https://'],
		['ftp://acme.com', 'must start with https://'],
		['javascript:alert(1)', 'must start with https://'],
		['not a url', 'is not a valid URL'],
		['https://user:pass@acme.com', 'must not contain credentials'],
		['https://acme.com:8443', 'must not use a custom port'],
		['https://127.0.0.1', 'not an IP address'],
		['https://169.254.169.254/latest/meta-data', 'not an IP address'],
		['https://[::1]/', 'not an IP address'],
		['https://localhost', 'must be a public website'],
		['https://api.localhost', 'must be a public website'],
		['https://printer.local', 'must be a public website'],
		['https://db.internal', 'must be a public website'],
		['https://intranet', 'must be a public website'],
	])('rejects %s (%s)', (url, message) => {
		rejects(PublicUrl, url, message);
	});

	it('rejects URLs longer than 2048 characters', () => {
		expect(publicUrlProblem(`https://acme.com/${'a'.repeat(2048)}`)).toBe('is too long');
	});
});

describe('scalars', () => {
	it('allows only 15, 30 or 45 second videos', () => {
		for (const d of [15, 30, 45]) accepts(Duration, d);
		for (const d of [0, 10, 60, '30']) rejects(Duration, d);
	});

	it('allows only the three ratios', () => {
		for (const r of ['16:9', '9:16', '1:1']) accepts(Ratio, r);
		rejects(Ratio, '4:3');
	});

	it('validates hex colors', () => {
		for (const c of ['#fff', '#7c5cff', '#7c5cff80']) accepts(HexColor, c);
		for (const c of ['7c5cff', '#ggg', 'red']) rejects(HexColor, c);
	});
});

describe('pagination', () => {
	it('defaults and coerces the limit', () => {
		expect(accepts(PageQuery, {})).toEqual({limit: 20});
		expect(accepts(PageQuery, {limit: '50', cursor: 'abc'})).toEqual({limit: 50, cursor: 'abc'});
	});

	it('bounds the limit and rejects unknown params', () => {
		rejects(PageQuery, {limit: 0});
		rejects(PageQuery, {limit: 101});
		rejects(PageQuery, {limit: 10, sort: 'desc'});
	});

	it('wraps items with a cursor', () => {
		const schema = page(z.number());
		accepts(schema, {items: [1, 2], nextCursor: null});
		rejects(schema, {items: ['x'], nextCursor: null});
	});

	it('validates signed URLs', () => {
		accepts(SignedUrl, {url: 'https://files.kinetiqcontent.com/a.mp4?sig=x', expiresAt: now});
		rejects(SignedUrl, {url: 'nope', expiresAt: now});
	});
});
