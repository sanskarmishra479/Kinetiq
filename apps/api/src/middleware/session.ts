import {fromNodeHeaders} from 'better-auth/node';
import type {RequestHandler} from 'express';
import type {Auth} from '../auth.js';
import {AppError} from '../errors.js';

// Who is calling? Loads the session once per request and exposes a small,
// explicit identity on req.auth. Route code never reads cookies itself.

export type RequestIdentity = {userId: string; role: 'user' | 'admin'; twoFactorEnabled: boolean; sessionId: string};

export function loadSession(auth: Auth): RequestHandler {
	return async (req, _res, next) => {
		try {
			const result = await auth.api.getSession({headers: fromNodeHeaders(req.headers)});
			if (result) {
				const user = result.user as {id: string; role?: unknown; twoFactorEnabled?: unknown};
				req.auth = {
					userId: user.id,
					role: user.role === 'admin' ? 'admin' : 'user',
					twoFactorEnabled: user.twoFactorEnabled === true,
					sessionId: result.session.id,
				};
			}
			next();
		} catch (error) {
			next(error);
		}
	};
}

export const requireAuth: RequestHandler = (req, _res, next) => {
	next(req.auth ? undefined : new AppError('UNAUTHENTICATED', 'Log in to continue'));
};

/**
 * Admin-only routes. Admins must have two-factor enabled (FR-AUTH-07); a
 * session without it is treated as not an admin.
 * TODO(Phase 12): require a fresh TOTP step-up for the admin HTTP API.
 */
export const requireAdmin: RequestHandler = (req, _res, next) => {
	if (!req.auth) return next(new AppError('UNAUTHENTICATED', 'Log in to continue'));
	if (req.auth.role !== 'admin' || !req.auth.twoFactorEnabled) {
		return next(new AppError('FORBIDDEN', 'Admin access with two-factor authentication is required'));
	}
	next();
};
