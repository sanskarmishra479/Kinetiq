import {randomBytes} from 'node:crypto';
import type {IdPort} from '@kinetiq/domain';

// Production id generator: "<prefix>_" + 10 chars of time + 16 random chars,
// Crockford base32 (ULID layout). Ids sort by creation time, which gives
// cheap newest-first pagination (ORDER BY id DESC). 80 random bits per id.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(ms: number): string {
	let out = '';
	let n = ms;
	for (let i = 0; i < 10; i++) {
		out = ALPHABET[n % 32] + out;
		n = Math.floor(n / 32);
	}
	return out;
}

function encodeRandom(): string {
	const bytes = randomBytes(16);
	let out = '';
	for (const b of bytes) out += ALPHABET[b % 32];
	return out;
}

export function createIdGenerator(now: () => number = Date.now): IdPort {
	return {next: (prefix) => `${prefix}_${encodeTime(now())}${encodeRandom()}`};
}
