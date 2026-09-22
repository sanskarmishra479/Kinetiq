// Content-Security-Policy for the render page (NFR-SEC-12). Even code that
// slipped past the validator can't send data anywhere:
// - no connections except the page's own origin and Remotion's local media proxy
// - images, media and fonts only from our content origins and Google Fonts
// - scripts only from the deployed bundle ('unsafe-eval' is how scene code is loaded)

const FONT_ORIGINS = ['https://fonts.gstatic.com'];
/** Remotion serves media frames through a proxy on localhost while rendering. */
const LOCAL = ['http://localhost:*', 'http://127.0.0.1:*'];

export function buildCsp(assetOrigins: readonly string[]): string {
	const assets = [...new Set(assetOrigins)].join(' ');
	const list = (...parts: string[]) => parts.filter(Boolean).join(' ');
	return [
		"default-src 'none'",
		"script-src 'self' 'unsafe-eval'",
		list("style-src 'self' 'unsafe-inline'"),
		list("img-src 'self' data: blob:", assets, ...LOCAL),
		list("media-src 'self' data: blob:", assets, ...LOCAL),
		list("font-src 'self' data:", ...FONT_ORIGINS, assets),
		list("connect-src 'self'", ...LOCAL),
		"frame-src 'none'",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'none'",
	].join('; ');
}

/** Adds the policy to the page. Browsers enforce a <meta> CSP from the moment it is inserted. */
export function installCsp(doc: Document, assetOrigins: readonly string[]): void {
	if (doc.querySelector('meta[http-equiv="Content-Security-Policy"]')) return;
	const meta = doc.createElement('meta');
	meta.httpEquiv = 'Content-Security-Policy';
	meta.content = buildCsp(assetOrigins);
	doc.head.prepend(meta);
}
