import {useId, useMemo} from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';

type Props = {
	// How much the center bulges toward the viewer. 0 = flat.
	strength?: number;
	// How dark the corners get (0–1).
	vignette?: number;
	children: React.ReactNode;
};

// Map resolution; the filter stretches it smoothly to the full frame.
const MAP_W = 960;
const MAP_H = 540;

// Curved-glass look: barrel distortion (center magnified, edges squeezed,
// corners stay pinned so no black borders) plus a soft vignette.
export const Lens: React.FC<Props> = ({strength = 0.12, vignette = 0.35, children}) => {
	const {width, height} = useVideoConfig();
	const id = `lens-${useId().replace(/:/g, '')}`;

	// Largest pixel shift the map can express; the peak shift of this curve is
	// about 4.5% of the half-diagonal, so this leaves headroom.
	const range = Math.hypot(width, height) * 0.1;
	const map = useMemo(() => buildMap(strength, width, height, range), [strength, width, height, range]);

	return (
		<AbsoluteFill style={{background: '#000'}}>
			<svg width={0} height={0} style={{position: 'absolute'}}>
				<filter
					id={id}
					filterUnits="userSpaceOnUse"
					primitiveUnits="userSpaceOnUse"
					x={0}
					y={0}
					width={width}
					height={height}
					colorInterpolationFilters="sRGB"
				>
					<feImage href={map} x={0} y={0} width={width} height={height} preserveAspectRatio="none" result="map" />
					<feDisplacementMap in="SourceGraphic" in2="map" scale={range} xChannelSelector="R" yChannelSelector="G" />
				</filter>
			</svg>
			<AbsoluteFill style={{filter: strength > 0 ? `url(#${id})` : undefined}}>{children}</AbsoluteFill>
			{vignette > 0 && (
				<AbsoluteFill
					style={{
						pointerEvents: 'none',
						background: `radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,${vignette}) 100%)`,
					}}
				/>
			)}
		</AbsoluteFill>
	);
};

// Displacement map: each output pixel samples the source at
// r * (1 + k r²) / (1 + k), which magnifies the center and keeps corners fixed.
function buildMap(k: number, width: number, height: number, range: number): string {
	const canvas = document.createElement('canvas');
	canvas.width = MAP_W;
	canvas.height = MAP_H;
	const ctx = canvas.getContext('2d')!;
	const img = ctx.createImageData(MAP_W, MAP_H);
	const halfDiag = Math.hypot(width, height) / 2;

	for (let j = 0; j < MAP_H; j++) {
		for (let i = 0; i < MAP_W; i++) {
			const dx = ((i + 0.5) / MAP_W - 0.5) * width;
			const dy = ((j + 0.5) / MAP_H - 0.5) * height;
			const r = Math.hypot(dx, dy) / halfDiag;
			const g = (k * (r * r - 1)) / (1 + k);
			const o = (j * MAP_W + i) * 4;
			img.data[o] = clampByte(128 + ((dx * g) / range) * 255);
			img.data[o + 1] = clampByte(128 + ((dy * g) / range) * 255);
			img.data[o + 2] = 128;
			img.data[o + 3] = 255;
		}
	}
	ctx.putImageData(img, 0, 0);
	return canvas.toDataURL('image/png');
}

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
