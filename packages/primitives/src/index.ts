// Public API of @kinetiq/primitives: the only building blocks LLM-written
// scene code may use (docs/ARCHITECTURE.md §6).
export {dur, ease, keyframes, openClose, springs, tween} from './motion';
export type {Keyframe} from './motion';
export {darkCinematic, minimalLight, ThemeProvider, useTheme} from './theme';
export type {Theme} from './theme';

export {isDark, luminance} from './color';

export {Background} from './primitives/Background';
export {Browser, browserChrome} from './primitives/Browser';
export type {ScrollKey} from './primitives/Browser';
export {browserLayout, browserTimeline, chromeScale, splitUrl} from './primitives/browserLayout';
export type {BrowserLayout, BrowserTimeline} from './primitives/browserLayout';
export {Camera} from './primitives/Camera';
export type {Shot} from './primitives/Camera';
export {CaptionPills} from './primitives/CaptionPill';
export type {CaptionLine} from './primitives/CaptionPill';
export {Captions} from './primitives/Captions';
export type {CaptionWord} from './primitives/Captions';
export {ChatBubble, TypingDots} from './primitives/ChatBubble';
export {Cursor, cursorAt, isPressed} from './primitives/Cursor';
export type {CursorPoint} from './primitives/Cursor';
export {Dock, MenuBar, Wallpaper} from './primitives/Desktop';
export {KineticStack} from './primitives/KineticStack';
export {Lens} from './primitives/Lens';
export {LogoReveal} from './primitives/LogoReveal';
export {Chip, Dropdown, MENU_PAD, MENU_ROW, menuRowY} from './primitives/Menu';
export type {MenuItem} from './primitives/Menu';
export {Notification} from './primitives/Notification';
export {Typewriter} from './primitives/Typewriter';
export {Window} from './primitives/Window';
