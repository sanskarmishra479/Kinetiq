// Scenes the validator must accept: the kind of code the scene coder writes.

export const VALID_SCENES: Record<string, string> = {
	title: `
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {KineticStack, useTheme} from '@kinetiq/primitives';

type Props = {headline: string; lines: string[]};

export default function TitleScene({headline, lines}: Props) {
	const frame = useCurrentFrame();
	const {fps, width} = useVideoConfig();
	const theme = useTheme();
	const pop = spring({frame, fps, config: {damping: 200}});
	const opacity = interpolate(frame, [0, 15], [0, 1], {extrapolateRight: 'clamp'});
	const first = lines.at(0) ?? '';
	return (
		<AbsoluteFill style={{background: theme.bg, alignItems: 'center', justifyContent: 'center'}}>
			<h1 style={{opacity, transform: \`scale(\${pop})\`, fontSize: Math.round(width / 20), color: theme.fg}}>{headline}</h1>
			<KineticStack lines={lines} />
			<p>{first.toUpperCase()}</p>
		</AbsoluteFill>
	);
}`,
	arrowWithTypesAndSvg: `
import React from 'react';
import type {CSSProperties} from 'react';
import {AbsoluteFill, Easing, interpolate, random, useCurrentFrame} from 'remotion';

const DOTS = Array.from({length: 12}, (_, i) => i);
const box: CSSProperties = {position: 'absolute', inset: 0};

const Scene: React.FC<{accent?: string}> = ({accent = '#7c3aed'}) => {
	const frame = useCurrentFrame();
	const t = interpolate(frame, [0, 60], [0, 1], {easing: Easing.bezier(0.2, 0, 0, 1)});
	const dots = React.useMemo(() => DOTS.map((i) => ({i, x: random('x' + i) * 100})), []);
	const colors = new Map<string, string>([['a', accent]]);
	return (
		<AbsoluteFill style={box}>
			<svg viewBox="0 0 100 100" width="100%" height="100%">
				<defs>
					<linearGradient id="g"><stop offset="0" stopColor={colors.get('a')} /></linearGradient>
				</defs>
				{dots.map((d) => (
					<circle key={d.i} cx={d.x} cy={50} r={2 + t * 3} fill="url(#g)" />
				))}
			</svg>
			<React.Fragment>{String(Number.isFinite(t))}</React.Fragment>
		</AbsoluteFill>
	);
};

export default Scene;`,
	sequencesAndProps: `
import {Fragment} from 'react';
import {AbsoluteFill, Sequence, Series} from 'remotion';
import {Browser, Cursor, Window, dur} from '@kinetiq/primitives';

type Props = {url: string; items: {label: string}[]; config: Record<string, number>};

export default ({url, items, config}: Props) => {
	const {speed = 1, ...rest} = config;
	const total = Object.keys(rest).length + items.length;
	const labels = items.map(({label}, i) => \`\${i + 1}. \${label}\`).join(', ');
	let count = 0;
	for (const item of items) {
		if (item.label.length > 3) count++;
	}
	return (
		<AbsoluteFill>
			<Series>
				<Series.Sequence durationInFrames={dur.slow}><Window title={labels} width={800} height={500}><div /></Window></Series.Sequence>
			</Series>
			<Sequence from={30 * speed}><Browser url={url} width={1200} height={700} /></Sequence>
			<Fragment>{total + count}</Fragment>
			<Cursor path={[{x: 100, y: 100, frame: 0}, {x: 400, y: 300, frame: 30}]} />
			<span data-count={items['length']}>{items[0]?.label}</span>
		</AbsoluteFill>
	);
};`,
};
