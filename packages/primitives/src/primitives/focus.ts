// Pure math for Spotlight, ZoomFocus and CardGrid: where a highlighted area is
// at a frame, how to zoom so it fills the frame, and how to lay out cards.
import {keyframes} from '../motion';

export type Rect = {x: number; y: number; w: number; h: number};
export type RectKey = Rect & {frame: number};

// A rect that is either fixed or keyframed (so a spotlight can glide between elements).
export function rectAt(frame: number, rect: Rect | RectKey[]): Rect {
	if (!Array.isArray(rect)) return rect;
	const {x, y, w, h} = keyframes(frame, rect, ['x', 'y', 'w', 'h']);
	return {x, y, w, h};
}

// Camera (center + scale) that makes `rect` fill the frame, leaving `padding`
// (a fraction of the frame) around it. Never zooms out below 1 or past maxScale.
export function fitRect(rect: Rect, frameW: number, frameH: number, padding = 0.18, maxScale = 4) {
	const scale = Math.min(
		maxScale,
		Math.max(1, Math.min((frameW * (1 - padding)) / rect.w, (frameH * (1 - padding)) / rect.h)),
	);
	return {x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, scale};
}

// Where a scene point lands on screen for a camera looking at (cx, cy) at `scale`
// (same transform as <Camera>).
export const toScreen = (px: number, py: number, cam: {x: number; y: number; scale: number}, W: number, H: number) => ({
	x: W / 2 + (px - cam.x) * cam.scale,
	y: H / 2 + (py - cam.y) * cam.scale,
});

// Columns for a card grid: wide frames get more columns, tall frames fewer.
export function gridColumns(count: number, frameW: number, frameH: number): number {
	const aspect = frameW / frameH;
	const max = aspect >= 1.5 ? 3 : aspect >= 0.9 ? 2 : count > 4 ? 2 : 1;
	if (count === 4 && max === 3) return 2;
	return Math.max(1, Math.min(max, count));
}

// Cards arrive in diagonal waves (top-left first), which reads as one smooth sweep.
export const cardWave = (i: number, cols: number) => Math.floor(i / cols) + (i % cols);
