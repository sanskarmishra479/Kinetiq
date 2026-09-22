import {ERROR_STATUS, type ErrorCode} from '@kinetiq/shared';
import type {ErrorRequestHandler, RequestHandler} from 'express';
import {ZodError} from 'zod';

// One error type for every handled failure. Anything else becomes a generic
// 500 with no internal details (docs/API.md §1 "Error format").

export class AppError extends Error {
	constructor(
		readonly code: ErrorCode,
		message: string,
		readonly details?: Record<string, unknown>,
		readonly headers?: Record<string, string>,
	) {
		super(message);
		this.name = 'AppError';
	}

	get status(): number {
		return ERROR_STATUS[this.code];
	}
}

export const notFound = (what = 'Not found') => new AppError('NOT_FOUND', what);

export function fieldErrors(error: ZodError): Record<string, string> {
	const fields: Record<string, string> = {};
	for (const issue of error.issues) {
		const path = issue.path.join('.') || '_';
		fields[path] ??= issue.message;
	}
	return fields;
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
	next(notFound('Route not found'));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
	let error: AppError;
	if (err instanceof AppError) {
		error = err;
	} else if (err instanceof ZodError) {
		error = new AppError('VALIDATION_ERROR', 'Invalid request', {fields: fieldErrors(err)});
	} else if (isBodyParserError(err)) {
		error =
			err.type === 'entity.too.large'
				? new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large')
				: new AppError('VALIDATION_ERROR', 'Request body is not valid JSON');
	} else {
		req.log?.error({err}, 'unhandled error');
		error = new AppError('INTERNAL', 'Something went wrong');
	}

	for (const [name, value] of Object.entries(error.headers ?? {})) res.setHeader(name, value);
	res.status(error.status).json({
		error: {
			code: error.code,
			message: error.message,
			...(error.details ? {details: error.details} : {}),
			requestId: req.id ?? 'unknown',
		},
	});
};

function isBodyParserError(err: unknown): err is {type: string} {
	return typeof err === 'object' && err !== null && 'type' in err && typeof (err as {type: unknown}).type === 'string'
		? ['entity.too.large', 'entity.parse.failed', 'encoding.unsupported', 'charset.unsupported'].includes(
				(err as {type: string}).type,
			)
		: false;
}
