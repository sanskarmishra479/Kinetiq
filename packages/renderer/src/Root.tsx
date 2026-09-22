import {darkCinematic} from '@kinetiq/primitives';
import {RATIO_SIZE, RENDER_FPS, RenderInput, totalFrames, type ParsedRenderInput} from '@kinetiq/shared';
import {Composition} from 'remotion';
import {FinalVideo} from './FinalVideo';

// One composition renders every video. Its size and length come from the
// validated input, so a bad input fails before any scene code runs.

export const COMPOSITION_ID = 'Final';

const PLACEHOLDER: ParsedRenderInput = RenderInput.parse({
	ratio: '16:9',
	theme: {...darkCinematic},
	scenes: [
		{
			id: 'hello',
			code: 'var _jsxruntime = require("react/jsx-runtime"); var _remotion = require("remotion"); exports.default = () => _jsxruntime.jsx(_remotion.AbsoluteFill, {style: {color: "white", fontSize: 80, alignItems: "center", justifyContent: "center"}, children: "Kinetiq"});',
			durationInFrames: 60,
		},
	],
});

export const Root: React.FC = () => (
	<Composition
		id={COMPOSITION_ID}
		component={FinalVideo}
		defaultProps={PLACEHOLDER}
		fps={RENDER_FPS}
		width={1920}
		height={1080}
		durationInFrames={60}
		calculateMetadata={({props}) => {
			const input = RenderInput.parse(props);
			return {props: input, durationInFrames: totalFrames(input), fps: RENDER_FPS, ...RATIO_SIZE[input.ratio]};
		}}
	/>
);
