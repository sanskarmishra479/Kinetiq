import {describe, expect, it} from 'vitest';
import {parseFfprobe} from './adapters/ffprobe.js';
import {checkVideo} from './video-rules.js';

const good = {durationSec: 42, video: {codec: 'h264', width: 1920, height: 1080}, formats: ['mov', 'mp4']};

describe('checkVideo (FR-PRJ-04)', () => {
	it('accepts a normal screen recording', () => {
		expect(checkVideo(good)).toEqual({ok: true, durationSec: 42});
		expect(checkVideo({...good, video: {codec: 'vp9', width: 4096, height: 2160}})).toMatchObject({ok: true});
	});

	it.each([
		[{...good, video: null}, /no video track/],
		[{...good, video: {codec: 'prores', width: 1920, height: 1080}}, /codec \(prores\)/],
		[{...good, video: {codec: 'h264', width: 0, height: 1080}}, /size/],
		[{...good, video: {codec: 'h264', width: 8000, height: 1080}}, /size/],
		[{...good, durationSec: null}, /length/],
		[{...good, durationSec: 0}, /length/],
		[{...good, durationSec: 121}, /2 minutes/],
	])('rejects %j', (facts, reason) => {
		const verdict = checkVideo(facts);
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.reason).toMatch(reason);
	});
});

describe('parseFfprobe', () => {
	it('reads duration, the first video stream and the container formats', () => {
		expect(
			parseFfprobe({
				format: {duration: '12.5', format_name: 'mov,mp4'},
				streams: [
					{codec_type: 'audio', codec_name: 'aac'},
					{codec_type: 'video', codec_name: 'h264', width: 640, height: 360},
				],
			}),
		).toEqual({durationSec: 12.5, video: {codec: 'h264', width: 640, height: 360}, formats: ['mov', 'mp4']});
	});

	it('handles missing fields', () => {
		expect(parseFfprobe({streams: [{codec_type: 'video'}]})).toEqual({
			durationSec: null,
			video: {codec: 'unknown', width: 0, height: 0},
			formats: [],
		});
		expect(() => parseFfprobe({streams: 'nope'})).toThrow();
	});
});
