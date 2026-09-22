import type {RequestIdentity} from './middleware/session.js';

// The caller's identity, set by loadSession (src/middleware/session.ts).
declare global {
	namespace Express {
		interface Request {
			auth?: RequestIdentity;
		}
	}
}
