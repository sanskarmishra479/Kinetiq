import {PAYG_LIMITS, PLANS, type MeResponse} from '@kinetiq/shared';
import {fromNodeHeaders} from 'better-auth/node';
import {Router} from 'express';
import {z} from 'zod';
import type {Container} from '../container.js';
import {AppError} from '../errors.js';
import {requireAuth} from '../middleware/session.js';

// GET /v1/me and DELETE /v1/me (docs/API.md §3).

const DeleteAccountRequest = z.strictObject({confirm: z.literal(true)});

export function accountRoutes({repos, auth}: Container): Router {
	const router = Router();

	router.get('/me', requireAuth, async (req, res) => {
		const userId = req.auth!.userId;
		const profile = await repos.accounts.getProfile(userId);
		if (!profile) throw new AppError('UNAUTHENTICATED', 'Account no longer exists');
		const [buckets, total, reserved] = await Promise.all([
			repos.accounts.usableBuckets(userId),
			repos.accounts.ledgerBalance(userId),
			repos.accounts.reservedCredits(userId),
		]);
		const plan = profile.plan ? PLANS.find((p) => p.code === profile.plan?.code) : undefined;
		const body: MeResponse = {
			user: {id: profile.user.id, email: profile.user.email, name: profile.user.name, image: profile.user.image},
			plan: profile.plan,
			credits: {total, reserved, buckets},
			limits: plan?.limits ?? PAYG_LIMITS,
		};
		res.json(body);
	});

	/** Deletes the account and all its data (NFR-LEG-02). Requires {"confirm": true}. */
	router.delete('/me', requireAuth, async (req, res) => {
		DeleteAccountRequest.parse(req.body);
		const signOut = await auth.api.signOut({headers: fromNodeHeaders(req.headers), asResponse: true});
		await repos.accounts.deleteUser(req.auth!.userId);
		// Expire the session cookies in the browser too.
		for (const cookie of signOut.headers.getSetCookie()) res.append('Set-Cookie', cookie);
		res.status(204).end();
	});

	return router;
}

export function healthRoutes({health}: Container): Router {
	const router = Router();
	/** The process is up (no dependencies checked). */
	router.get('/healthz', (_req, res) => {
		res.json({ok: true});
	});
	/** Database and Redis reachable; used by the load balancer before sending traffic. */
	router.get('/readyz', async (_req, res) => {
		const down = await health.check();
		res.status(down.length === 0 ? 200 : 503).json({ok: down.length === 0, down});
	});
	return router;
}
