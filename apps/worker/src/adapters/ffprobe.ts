import {execFile} from 'node:child_process';
import {z} from 'zod';
import type {MediaProbePort, ProbeFacts} from '../ports.js';

// ffprobe on uploaded videos (FR-PRJ-04).
// Hardening: ffmpeg understands playlists and many protocols that can read
// local files or reach internal hosts. We only allow http(s) and force the
// demuxer to the type we already verified from the file's first bytes.

const DEMUXER = {'video/mp4': 'mov,mp4,m4a,3gp,3g2,mj2', 'video/webm': 'matroska,webm'} as const;

const FfprobeOutput = z.object({
	format: z.object({duration: z.string().optional(), format_name: z.string()}).optional(),
	streams: z
		.array(
			z.object({
				codec_type: z.string().optional(),
				codec_name: z.string().optional(),
				width: z.number().optional(),
				height: z.number().optional(),
			}),
		)
		.default([]),
});

export function parseFfprobe(json: unknown): ProbeFacts {
	const out = FfprobeOutput.parse(json);
	const video = out.streams.find((s) => s.codec_type === 'video');
	const duration = Number(out.format?.duration);
	return {
		durationSec: Number.isFinite(duration) ? duration : null,
		video: video ? {codec: video.codec_name ?? 'unknown', width: video.width ?? 0, height: video.height ?? 0} : null,
		formats: (out.format?.format_name ?? '').split(',').filter(Boolean),
	};
}

export function ffprobe(bin = 'ffprobe', timeoutMs = 30_000): MediaProbePort {
	return {
		probe(url, mime) {
			const args = [
				'-v',
				'error',
				'-protocol_whitelist',
				'http,https,tcp,tls',
				'-f',
				DEMUXER[mime],
				'-print_format',
				'json',
				'-show_format',
				'-show_streams',
				'-i',
				url,
			];
			return new Promise((resolve, reject) => {
				execFile(bin, args, {timeout: timeoutMs, maxBuffer: 1024 * 1024}, (error, stdout) => {
					if (error) return reject(new Error(`ffprobe failed: ${error.message.split('\n')[0]}`));
					try {
						resolve(parseFfprobe(JSON.parse(stdout)));
					} catch (e) {
						reject(e);
					}
				});
			});
		},
	};
}
