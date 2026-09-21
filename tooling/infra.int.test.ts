import {createConnection} from 'node:net';
import {describe, expect, it} from 'vitest';

// NFR-SCALE-06: BullMQ loses jobs if Redis evicts keys, so the policy must be noeviction.
// Talks raw RESP so this check needs no client library.
function redisCommand(url: string, ...args: string[]): Promise<string> {
	const {hostname, port} = new URL(url);
	const payload = `*${args.length}\r\n${args.map((a) => `$${Buffer.byteLength(a)}\r\n${a}\r\n`).join('')}`;
	return new Promise((resolve, reject) => {
		const socket = createConnection({host: hostname, port: Number(port || 6379)}, () => socket.write(payload));
		let data = '';
		socket.setTimeout(5_000, () => socket.destroy(new Error('Redis timeout')));
		socket.on('data', (chunk) => {
			data += chunk.toString();
			socket.end();
		});
		socket.on('end', () => resolve(data));
		socket.on('error', reject);
	});
}

describe('local infrastructure', () => {
	it('runs Redis with maxmemory-policy noeviction', async () => {
		const reply = await redisCommand(
			process.env.REDIS_URL ?? 'redis://localhost:6379',
			'CONFIG',
			'GET',
			'maxmemory-policy',
		);
		expect(reply).toContain('noeviction');
	});
});
