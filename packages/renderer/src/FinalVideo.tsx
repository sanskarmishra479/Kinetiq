import {Captions, Lens, ThemeProvider} from '@kinetiq/primitives';
import type {ParsedRenderInput} from '@kinetiq/shared';
import {Component, useMemo, type ReactNode} from 'react';
import {AbsoluteFill, Html5Audio, Sequence, Series, useVideoConfig} from 'remotion';
import {evaluateScene, SceneCodeError} from './runtime/evaluate';

// The whole video: scenes back to back, then captions, the optional lens
// finish and audio tracks (docs/ARCHITECTURE.md §6).

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

/** Captions sit in the bottom safe area, on top of the lens finish so they stay flat and readable. */
const CaptionTrack: React.FC<{words: ParsedRenderInput['captions']}> = ({words}) => {
	const {width, height} = useVideoConfig();
	return (
		<AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: Math.round(height * 0.08)}}>
			<Captions words={words} fontSize={Math.round(Math.min(width, height) * 0.052)} />
		</AbsoluteFill>
	);
};

const Frame: React.FC<{lens: boolean; children: ReactNode}> = ({lens, children}) =>
	lens ? <Lens>{children}</Lens> : <AbsoluteFill>{children}</AbsoluteFill>;

export const FinalVideo: React.FC<ParsedRenderInput> = ({theme, scenes, audio, captions, lens}) => (
	<ThemeProvider value={theme}>
		<AbsoluteFill style={{background: theme.bg}}>
			<Frame lens={lens}>
				<Series>
					{scenes.map((scene) => (
						<Series.Sequence key={scene.id} durationInFrames={scene.durationInFrames}>
							<SceneBoundary id={scene.id}>
								<DynamicScene id={scene.id} code={scene.code} props={scene.props} />
							</SceneBoundary>
						</Series.Sequence>
					))}
				</Series>
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
