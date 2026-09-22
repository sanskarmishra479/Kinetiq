import {createContext, useContext} from 'react';
import {loadFont} from '@remotion/google-fonts/Inter';

const {fontFamily} = loadFont('normal', {
	weights: ['400', '500', '600', '800'],
	subsets: ['latin'],
});

// A Theme is the code form of a DESIGN.md: the LLM fills this from the
// user's website (or a preset) and every primitive reads from it.
export type Theme = {
	bg: string;
	surface: string;
	surfaceAlt: string;
	border: string;
	fg: string;
	muted: string;
	accent: string;
	accentFg: string;
	radius: number;
	fontFamily: string;
	// Optional brand personality. Leave out for a neutral look; see resolveStyle().
	headingFont?: string;
	// 2–4 extra brand colors, used where a layout needs more than one accent.
	palette?: string[];
	style?: ThemeStyle;
};

// How surfaces are drawn. This is what makes two brands look like two different
// designers made them, not just the same template recolored.
export type ThemeStyle = {
	// Card fill: solid surface, just an outline, a tint of the accent, or full brand color.
	surface?: 'solid' | 'outline' | 'tint' | 'brand';
	border?: 'none' | 'hairline' | 'bold';
	// 'hard' = offset solid shadow (playful), 'soft' = blurred, 'none' = flat.
	shadow?: 'none' | 'soft' | 'hard';
	// Heading weight and letter spacing.
	headingWeight?: number;
	headingTracking?: number;
};

export type ResolvedStyle = Required<ThemeStyle> & {headingFont: string; palette: string[]};

// Fill in defaults, so primitives can read every style token without checks.
export function resolveStyle(theme: Theme): ResolvedStyle {
	return {
		surface: theme.style?.surface ?? 'solid',
		border: theme.style?.border ?? 'hairline',
		shadow: theme.style?.shadow ?? 'soft',
		headingWeight: theme.style?.headingWeight ?? 600,
		headingTracking: theme.style?.headingTracking ?? -0.02,
		headingFont: theme.headingFont ?? theme.fontFamily,
		palette: theme.palette?.length ? theme.palette : [theme.accent],
	};
}

export const darkCinematic: Theme = {
	bg: '#0a0a0c',
	surface: '#141417',
	surfaceAlt: '#1c1c21',
	border: 'rgba(255,255,255,0.08)',
	fg: '#f5f5f7',
	muted: '#8a8a93',
	accent: '#7c5cff',
	accentFg: '#ffffff',
	radius: 14,
	fontFamily,
};

export const minimalLight: Theme = {
	bg: '#f4f4f1',
	surface: '#ffffff',
	surfaceAlt: '#f0f0ee',
	border: 'rgba(0,0,0,0.08)',
	fg: '#111111',
	muted: '#6b6b6b',
	accent: '#0a84ff',
	accentFg: '#ffffff',
	radius: 16,
	fontFamily,
};

const ThemeContext = createContext<Theme>(darkCinematic);
export const ThemeProvider = ThemeContext.Provider;
export const useTheme = () => useContext(ThemeContext);
export const useThemeStyle = () => resolveStyle(useContext(ThemeContext));
