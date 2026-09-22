// Identifies an uploaded file by its first bytes ("magic numbers"), never by
// its name or the type the browser claimed (FR-PRJ-05, NFR-SEC-10). Anything
// we don't positively recognize (SVG, HTML, PDF, QuickTime, Matroska…) is null.

export type SniffedMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'video/mp4' | 'video/webm';

/** How many leading bytes sniffMime needs. */
export const SNIFF_BYTES = 64;

const ascii = (bytes: Uint8Array, start: number, length: number) =>
	String.fromCharCode(...bytes.subarray(start, start + length));

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
	signature.every((b, i) => bytes[offset + i] === b);

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG = [0xff, 0xd8, 0xff] as const;
const EBML = [0x1a, 0x45, 0xdf, 0xa3] as const;

// ISO-BMFF brands that are genuinely MP4 (QuickTime "qt  " is deliberately excluded).
const MP4_BRANDS = new Set(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'dash', 'M4V ', 'MSNV']);

export function sniffMime(bytes: Uint8Array): SniffedMime | null {
	if (startsWith(bytes, PNG)) return 'image/png';
	if (startsWith(bytes, JPEG)) return 'image/jpeg';
	if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
	if (ascii(bytes, 4, 4) === 'ftyp' && MP4_BRANDS.has(ascii(bytes, 8, 4))) return 'video/mp4';
	// WebM is Matroska with doctype "webm"; plain Matroska (.mkv) isn't accepted.
	if (startsWith(bytes, EBML) && ascii(bytes, 0, Math.min(bytes.length, SNIFF_BYTES)).includes('webm')) {
		return 'video/webm';
	}
	return null;
}

/** True for valid UTF-8 text with no NUL bytes (used for uploaded DESIGN.md files). */
export function looksLikeText(bytes: Uint8Array): boolean {
	if (bytes.includes(0)) return false;
	try {
		new TextDecoder('utf-8', {fatal: true}).decode(bytes);
		return true;
	} catch {
		return false;
	}
}
