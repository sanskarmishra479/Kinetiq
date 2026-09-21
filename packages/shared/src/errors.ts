import {z} from 'zod';

// Error contract for every API response (docs/API.md §1 "Error format").

export const ERROR_STATUS = {
	VALIDATION_ERROR: 400,
	UNAUTHENTICATED: 401,
	INSUFFICIENT_CREDITS: 402,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	IDEMPOTENCY_MISMATCH: 409,
	PAYLOAD_TOO_LARGE: 413,
	RATE_LIMITED: 429,
	CONCURRENCY_LIMIT: 429,
	INTERNAL: 500,
	DEGRADED: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;
export const ErrorCode = z.enum(Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]]);

export const ApiError = z.object({
	error: z.object({
		code: ErrorCode,
		message: z.string(),
		details: z.record(z.string(), z.unknown()).optional(),
		requestId: z.string(),
	}),
});
export type ApiError = z.infer<typeof ApiError>;

/** Field-level validation messages, keyed by dotted path ("assetIds.2"). */
export type FieldErrors = Record<string, string>;
