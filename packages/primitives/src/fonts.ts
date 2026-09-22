import {loadFont} from '@remotion/google-fonts/Inter';

// The "operating system" font. Real-world replicas (browser, windows, menu bar,
// notifications) always use it, whatever the brand font is, so they look real.
// Inter stands in for the system UI font (we never use SF Pro).
export const systemFont = loadFont('normal', {
	weights: ['400', '500', '600', '800'],
	subsets: ['latin'],
}).fontFamily;
