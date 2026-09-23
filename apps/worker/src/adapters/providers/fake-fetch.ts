import type {Fetch} from './http.js';

// A stand-in for the network in adapter tests: records every request and
// answers with scripted responses in order. No keys, no cost, no network.

export type Recorded = {url: string; method: string; headers: Record<string, string>; body: unknown};

type Reply = Response | Error | ((request: Recorded) => Response);

export function fakeFetch(replies: Reply[]): Fetch & {requests: Recorded[]} {
	const requests: Recorded[] = [];
	const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const headers = Object.fromEntries(new Headers(init?.headers).entries());
		const raw = init?.body;
		let body: unknown = raw ?? null;
		if (typeof raw === 'string') {
			try {
				body = JSON.parse(raw);
			} catch {
				body = raw;
			}
		}
		const request = {url: String(input), method: init?.method ?? 'GET', headers, body};
		requests.push(request);
		const reply = replies.shift();
		if (!reply) throw new Error(`unexpected request to ${request.url}`);
		if (reply instanceof Error) throw reply;
		return typeof reply === 'function' ? reply(request) : reply;
	}) as Fetch & {requests: Recorded[]};
	fetch.requests = requests;
	return fetch;
}

export const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});

export const bytes = (data: Uint8Array, contentType: string, status = 200) =>
	new Response(data, {status, headers: {'content-type': contentType, 'content-length': String(data.length)}});
