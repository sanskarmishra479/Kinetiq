import {Captions, Lens, ThemeProvider} from '@kinetiq/primitives';
import type {ParsedRenderInput} from '@kinetiq/shared';
import {Component, useMemo, type ReactNode} from 'react';
import {linearTiming, TransitionSeries} from '@remotion/transitions';
import {AbsoluteFill, Easing, Html5Audio, Sequence, useVideoConfig} from 'remotion';
import {evaluateScene, SceneCodeError} from './runtime/evaluate';
import {captionLines} from './captions';
import {focusPush, TRANSITION_FRAMES} from './transitions';

// The whole video: scenes joined by transitions (never hard cuts), captions,
// the optional lens finish and audio tracks (docs/ARCHITECTURE.md §6).

const DynamicScene: React.FC<{id: string; code: string; props: Record<string, unknown>}> = ({id, code, props}) => {
	const Scene = useMemo(() => evaluateScene(id, code), [id, code]);
	return <Scene {...props} />;
};

/** Makes a scene's runtime error name the scene, so the fix loop knows which one to repair. */
class SceneBoundary extends Component<{id: string; children: ReactNode}, {error: Error | null}> {
	override state: {error: Error | null} = {error: null};

	static getDerivedStateFromError(error: Error) {
		return {error};
	}

	override render() {
		const {error} = this.state;
		if (error) {
			throw error instanceof SceneCodeError ? error : new SceneCodeError(this.props.id, error.message);
		}
		return this.props.children;
	}
}

/**
 * Captions sit in the bottom safe area, on top of the lens finish so they stay
 * flat and readable. Each spoken line gets its own sequence, so a caption page
 * never shows words from the next line early.
 */
const CaptionTrack: React.FC<{words: ParsedRenderInput['captions']}> = ({words}) => {
	const {width, height} = useVideoConfig();
	const fontSize = Math.round(Math.min(width, height) * 0.052);
	return (
		<>
			{captionLines(words).map((line) => {
				const from = line[0]!.start;
				const until = line.at(-1)!.end + 8;
				const local = line.map((w) => ({text: w.text, start: w.start - from, end: w.end - from}));
				return (
					<Sequence key={`${from}-${line[0]!.text}`} from={from} durationInFrames={until - from} layout="none">
						<AbsoluteFill
							style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: Math.round(height * 0.08)}}
						>
							<Captions words={local} fontSize={fontSize} />
						</AbsoluteFill>
					</Sequence>
				);
			})}
		</>
	);
};

const Frame: React.FC<{lens: boolean; children: ReactNode}> = ({lens, children}) =>
	lens ? <Lens>{children}</Lens> : <AbsoluteFill>{children}</AbsoluteFill>;

export const FinalVideo: React.FC<ParsedRenderInput> = ({theme, scenes, audio, captions, lens}) => (
	<ThemeProvider value={theme}>
		<AbsoluteFill style={{background: theme.bg}}>
			<Frame lens={lens}>
				<TransitionSeries>
					{scenes.flatMap((scene, i) => {
						const last = i === scenes.length - 1;
						// Each scene (but the last) runs on under the next one's entrance, so every
						// scene still starts at the same frame and the total length doesn't change.
						const length = scene.durationInFrames + (last ? 0 : TRANSITION_FRAMES);
						const sequence = (
							<TransitionSeries.Sequence key={scene.id} durationInFrames={length}>
								<SceneBoundary id={scene.id}>
									<DynamicScene id={scene.id} code={scene.code} props={scene.props} />
								</SceneBoundary>
							</TransitionSeries.Sequence>
						);
						return last
							? [sequence]
							: [
									sequence,
									<TransitionSeries.Transition
										key={`${scene.id}-to-next`}
										presentation={focusPush()}
										timing={linearTiming({
											durationInFrames: TRANSITION_FRAMES,
											easing: Easing.bezier(0.65, 0, 0.35, 1),
										})}
									/>,
								];
					})}
				</TransitionSeries>
			</Frame>
			{captions.length > 0 ? <CaptionTrack words={captions} /> : null}
			{audio.map((track, i) => (
				<Sequence key={i} from={track.fromFrame}>
					<Html5Audio src={track.src} volume={track.volume} />
				</Sequence>
			))}
		</AbsoluteFill>
	</ThemeProvider>
);
