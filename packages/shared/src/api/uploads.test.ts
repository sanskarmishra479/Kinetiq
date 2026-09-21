import {describe, it} from 'vitest';
import {accepts, ids, now, rejects} from '../test-helpers.js';
import {Asset, CreateUploadRequest, CreateUploadResponse} from './uploads.js';

// SRS FR-PRJ-04/05, NFR-SEC-10.
const MB = 1024 * 1024;
const png = {filename: 'dashboard.png', mime: 'image/png', size: 2 * MB, kind: 'screenshot'};

describe('CreateUploadRequest', () => {
	it('accepts allowed images and videos within limits', () => {
		accepts(CreateUploadRequest, png);
		accepts(CreateUploadRequest, {...png, mime: 'image/webp', size: 10 * MB});
		accepts(CreateUploadRequest, {filename: 'demo.mp4', mime: 'video/mp4', size: 100 * MB, kind: 'recording'});
	});

	it.each(['image/svg+xml', 'text/html', 'application/pdf', 'application/octet-stream', 'video/quicktime'])(
		'rejects %s (script-capable or unsupported)',
		(mime) => {
			rejects(CreateUploadRequest, {...png, mime});
		},
	);

	it('enforces per-type size limits', () => {
		rejects(CreateUploadRequest, {...png, size: 10 * MB + 1}, 'at most 10 MB');
		rejects(
			CreateUploadRequest,
			{filename: 'x.mp4', mime: 'video/mp4', size: 100 * MB + 1, kind: 'recording'},
			'at most 100 MB',
		);
		rejects(CreateUploadRequest, {...png, size: 0});
	});

	it('requires recordings to be videos', () => {
		rejects(CreateUploadRequest, {...png, kind: 'recording'}, 'a recording must be a video');
	});

	it('rejects path tricks in the filename and client-chosen keys', () => {
		rejects(CreateUploadRequest, {...png, filename: '../../etc/passwd'});
		rejects(CreateUploadRequest, {...png, filename: 'a\\b.png'});
		rejects(CreateUploadRequest, {...png, filename: ''});
		rejects(CreateUploadRequest, {...png, key: 'u/usr_other/x.png'});
	});
});

describe('upload responses', () => {
	it('validates the presigned upload and asset shapes', () => {
		accepts(CreateUploadResponse, {
			assetId: ids.asset,
			upload: {url: 'https://r2.example.com/bucket', fields: {key: 'u/usr_abc12345/ast_abc12345'}},
			expiresAt: now,
		});
		accepts(Asset, {id: ids.asset, kind: 'logo', mime: 'image/png', size: 1234, status: 'ready', createdAt: now});
		rejects(Asset, {id: ids.asset, kind: 'logo', mime: 'image/svg+xml', size: 1234, status: 'ready', createdAt: now});
	});
});
