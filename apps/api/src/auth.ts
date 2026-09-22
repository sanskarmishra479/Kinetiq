import type {Db} from '@kinetiq/db';
import type {IdPort} from '@kinetiq/domain';
import type {Config} from '@kinetiq/shared';
import {betterAuth} from 'better-auth';
import {prismaAdapter} from 'better-auth/adapters/prisma';
import {APIError, createAuthMiddleware} from 'better-auth/api';
import {magicLink} from 'better-auth/plugins/magic-link';
import {twoFactor} from 'better-auth/plugins/two-factor';
import {RULES} from './middleware/rate-limit.js';
import type {CaptchaPort, EmailPort, RateLimitPort} from './ports.js';

// Authentication (SRS FR-AUTH-01…07). BetterAuth handles sessions, magic links,
// Google OAuth and TOTP two-factor; this file only configures it safely.

const ID_PREFIX: Record<string, string> = {
	user: 'usr',
	session: 'ses',
	account: 'acc',
	verification: 'vrf',
	twoFactor: 'tfa',
};

export type AuthDeps = {
	config: Config;
	db: Db;
	ids: IdPort;
	email: EmailPort;
	captcha: CaptchaPort;
	rateLimiter: RateLimitPort;
};

export function createAuth({config, db, ids, email, captcha, rateLimiter}: AuthDeps) {
	const deployed = config.APP_ENV !== 'local';
	const google =
		config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET
			? {google: {clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET}}
			: {};

	return betterAuth({
		appName: 'Kinetiq',
		baseURL: config.API_ORIGIN,
		basePath: '/api/auth',
		secret: config.BETTER_AUTH_SECRET,
		trustedOrigins: [config.WEB_ORIGIN],
		database: prismaAdapter(db, {provider: 'postgresql'}),
		telemetry: {enabled: false},
		// Our Redis limiter below replaces BetterAuth's per-process one (shared by every replica).
		rateLimit: {enabled: false},
		user: {
			additionalFields: {
				// Never settable by the user (input: false): only the database or an admin can grant it.
				role: {type: 'string', required: false, defaultValue: 'user', input: false},
			},
		},
		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: ['google'],
				// Blocks pre-registration account takeover (FR-AUTH-07).
				requireLocalEmailVerified: true,
			},
		},
		session: {expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24},
		socialProviders: google,
		advanced: {
			// Always on, explicitly: BetterAuth otherwise skips these checks when
			// NODE_ENV=test, and our tests must exercise the real behavior.
			disableOriginCheck: false,
			disableCSRFCheck: false,
			useSecureCookies: deployed,
			cookiePrefix: 'kinetiq',
			defaultCookieAttributes: {httpOnly: true, sameSite: 'lax', secure: deployed},
			...(config.COOKIE_DOMAIN ? {crossSubDomainCookies: {enabled: true, domain: config.COOKIE_DOMAIN}} : {}),
			ipAddress: {ipAddressHeaders: config.TRUST_PROXY > 0 ? ['cf-connecting-ip', 'x-forwarded-for'] : []},
			database: {generateId: ({model}) => ids.next(ID_PREFIX[model] ?? 'id')},
		},
		plugins: [
			magicLink({
				expiresIn: 10 * 60,
				storeToken: 'hashed',
				sendMagicLink: async ({email: to, url}) => {
					await email.send({template: 'magicLink', to, url});
				},
			}),
			twoFactor({issuer: 'Kinetiq'}),
		],
		hooks: {
			// Checks before a login email is sent (FR-AUTH-03, FR-AUTH-06). Rejected
			// requests get the same answer whether or not the email has an account.
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path !== '/sign-in/magic-link') return;
				const body = (ctx.body ?? {}) as {email?: unknown};
				const address = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
				if (!address) throw new APIError('BAD_REQUEST', {message: 'Email is required'});

				const limit = await rateLimiter.consume(RULES.magicLinkEmail, `email:${address}`);
				if (!limit.allowed) {
					throw new APIError('TOO_MANY_REQUESTS', {message: 'Too many login emails. Try again later.'});
				}
				const ip = ctx.request?.headers.get('cf-connecting-ip') ?? undefined;
				const ok = await captcha.verify(ctx.headers?.get('x-turnstile-token') ?? undefined, ip);
				if (!ok) throw new APIError('FORBIDDEN', {message: 'Captcha check failed. Please try again.'});
			}),
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;
