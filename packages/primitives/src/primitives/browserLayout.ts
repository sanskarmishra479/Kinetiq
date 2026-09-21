// Pure layout and timing math for <Browser>. Kept free of React so it can be
// unit-tested and reused by scenes (e.g. to aim the camera at the URL field).

// Chrome sizes in macOS points, measured from a real browser toolbar.
export const BROWSER_PT = {
	toolbar: 52,
	radius: 10,
	light: 12,
	lightGap: 20,
	lightLeft: 16,
	icon: 16,
	field: 28,
	fieldRadius: 7,
	// Below this window width (in points) the toolbar switches to compact mode.
	compactBelow: 900,
};

// How big the chrome is drawn: 1 = real Mac size at 1420px wide. Passing the
// video's short side keeps it readable in small windows (e.g. a 9:16 video),
// which then switch to compact chrome instead of shrinking.
export const chromeScale = (width: number, videoShortSide = 0) =>
	Math.min(2, Math.max(0.5, width / 1420, videoShortSide / 940));

export type BrowserLayout = {
	scale: number;
	compact: boolean;
	toolbar: number;
	radius: number;
	lights: {x: number; y: number; d: number}[];
	// Icon centers, in px from the window's left edge (right icons are also from the left).
	icons: {name: BrowserIcon; x: number}[];
	field: {x: number; y: number; w: number; h: number; r: number};
	iconSize: number;
};

export type BrowserIcon = 'sidebar' | 'chevron' | 'back' | 'forward' | 'shield' | 'share' | 'plus' | 'tabs';

export function browserLayout(width: number, scale = chromeScale(width)): BrowserLayout {
	const p = BROWSER_PT;
	const s = scale;
	const toolbar = p.toolbar * s;
	const cy = toolbar / 2;
	const compact = width / s < p.compactBelow;

	const lightX = (i: number) => (p.lightLeft + p.light / 2 + i * p.lightGap) * s;
	const lights = [0, 1, 2].map((i) => ({x: lightX(i), y: cy, d: p.light * s}));
	const afterLights = lightX(2) + (p.light / 2) * s;

	const left: {name: BrowserIcon; x: number}[] = compact
		? [{name: 'back', x: afterLights + 28 * s}]
		: [
				{name: 'sidebar', x: afterLights + 40 * s},
				{name: 'chevron', x: afterLights + 60 * s},
				{name: 'back', x: afterLights + 94 * s},
				{name: 'forward', x: afterLights + 128 * s},
			];
	const right: {name: BrowserIcon; x: number}[] = compact
		? [{name: 'tabs', x: width - 26 * s}]
		: [
				{name: 'share', x: width - 102 * s},
				{name: 'plus', x: width - 66 * s},
				{name: 'tabs', x: width - 28 * s},
			];

	const h = p.field * s;
	const leftEdge = Math.max(...left.map((i) => i.x)) + 20 * s;
	const rightEdge = Math.min(...right.map((i) => i.x)) - 20 * s;
	let field: BrowserLayout['field'];
	if (compact) {
		field = {x: leftEdge, y: cy - h / 2, w: Math.max(0, rightEdge - leftEdge), h, r: p.fieldRadius * s};
	} else {
		// Centered on the window, ~40% wide, never touching the icon groups
		// (the shield sits just left of the field, so leave room for it).
		const shieldRoom = 36 * s;
		const half = Math.min(width * 0.2, width / 2 - (leftEdge + shieldRoom), rightEdge - width / 2);
		const w = Math.max(0, half * 2);
		field = {x: width / 2 - w / 2, y: cy - h / 2, w, h, r: p.fieldRadius * s};
	}
	const icons = compact ? [...left, ...right] : [...left, {name: 'shield' as const, x: field.x - 20 * s}, ...right];

	return {scale: s, compact, toolbar, radius: p.radius * s, lights, icons, field, iconSize: p.icon * s};
}

// When each phase of the "type the URL, press enter, page loads" intro happens.
export type BrowserTimeline = {
	typeStart: number;
	typeEnd: number;
	loadStart: number;
	loadEnd: number;
	revealEnd: number;
};

export const URL_CHARS_PER_SECOND = 16;

export function browserTimeline(url: string, typeAt: number, fps: number): BrowserTimeline {
	const typeEnd = typeAt + Math.ceil((url.length / URL_CHARS_PER_SECOND) * fps);
	// Short beat after typing, as if pressing enter.
	const loadStart = typeEnd + Math.round(fps * 0.2);
	const loadEnd = loadStart + Math.round(fps * 0.8);
	const revealEnd = loadEnd + Math.round(fps * 0.5);
	return {typeStart: typeAt, typeEnd, loadStart, loadEnd, revealEnd};
}

// How many URL characters are visible at a frame while typing.
export const typedChars = (frame: number, url: string, typeAt: number, fps: number) =>
	Math.max(0, Math.min(url.length, Math.floor(((frame - typeAt) / fps) * URL_CHARS_PER_SECOND)));

// Split "https://www.acme.com/pricing?x=1" into what the URL field shows:
// the domain in full ink, the path dimmed. Protocol and "www." are hidden like real browsers do.
export function splitUrl(url: string): {domain: string; path: string} {
	const bare = url.replace(/^[a-z]+:\/\//i, '').replace(/^www\./i, '');
	const slash = bare.search(/[/?#]/);
	if (slash === -1) return {domain: bare, path: ''};
	const path = bare.slice(slash);
	return {domain: bare.slice(0, slash), path: path === '/' ? '' : path};
}

// Overlay scrollbar: thumb size/position for a scroll offset, and visible only while moving.
export function scrollThumb(offset: number, viewport: number, content: number) {
	if (content <= viewport) return {size: 0, top: 0};
	const size = Math.max(viewport * 0.08, (viewport / content) * viewport);
	const max = content - viewport;
	const t = Math.min(1, Math.max(0, offset / max));
	return {size, top: t * (viewport - size)};
}
