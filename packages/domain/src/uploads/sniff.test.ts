import {describe, expect, it} from 'vitest';
import {looksLikeText, sniffMime} from './sniff.js';

const bytes = (...parts: (number[] | string)[]) =>
	new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const pad = (b: Uint8Array) => {
	const out = new Uint8Array(64);
	out.set(b);
	return out;
};

describe('sniffMime (FR-PRJ-05)', () => {
	it.each([
		['image/png', bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
		['image/jpeg', bytes([0xff, 0xd8, 0xff, 0xe0])],
		['image/webp', bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ')],
		['video/mp4', bytes([0, 0, 0, 0x20], 'ftypisom')],
		['video/mp4', bytes([0, 0, 0, 0x18], 'ftypmp42')],
		['video/webm', bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84], 'webm')],
	])('recognizes %s', (mime, header) => {
		expect(sniffMime(pad(header))).toBe(mime);
	});

	it.each([
		['SVG', bytes('<svg xmlns="http://www.w3.org/2000/svg">')],
		['HTML renamed to .png', bytes('<!doctype html><script>alert(1)</script>')],
		['PDF', bytes('%PDF-1.7')],
		['QuickTime', bytes([0, 0, 0, 0x14], 'ftypqt  ')],
		['Matroska (not WebM)', bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88], 'matroska')],
		['GIF', bytes('GIF89a')],
		['RIFF that is not WebP (WAV)', bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt ')],
		['empty file', new Uint8Array(0)],
	])('rejects %s', (_name, header) => {
		expect(sniffMime(header)).toBeNull();
	});
});

describe('looksLikeText', () => {
	const enc = (s: string) => new TextEncoder().encode(s);
	it('accepts UTF-8 markdown', () => {
		expect(looksLikeText(enc('# Brand\nPrimary: #16a34a — café ✓'))).toBe(true);
	});
	it('rejects binary and invalid UTF-8', () => {
		expect(looksLikeText(bytes([0x89, 0x50, 0x4e, 0x47, 0x00]))).toBe(false);
		expect(looksLikeText(bytes([0xff, 0xfe, 0xfd]))).toBe(false);
	});
});
