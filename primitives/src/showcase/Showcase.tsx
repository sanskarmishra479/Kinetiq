import {linearTiming, springTiming, TransitionSeries} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {ChatScene, LogoScene, ProductScene, PromptScene, SCENES, TitleScene} from './scenes';

export const TRANSITION = 12;

export const SHOWCASE_DURATION =
	Object.values(SCENES).reduce((a, b) => a + b, 0) - TRANSITION * 4;

// All primitives in one short launch video, for judging the look and feel.
export const Showcase: React.FC = () => (
	<TransitionSeries>
		<TransitionSeries.Sequence durationInFrames={SCENES.title}>
			<TitleScene />
		</TransitionSeries.Sequence>
		<TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: TRANSITION})} />
		<TransitionSeries.Sequence durationInFrames={SCENES.product}>
			<ProductScene />
		</TransitionSeries.Sequence>
		<TransitionSeries.Transition
			presentation={slide({direction: 'from-bottom'})}
			timing={springTiming({durationInFrames: TRANSITION, config: {damping: 200}})}
		/>
		<TransitionSeries.Sequence durationInFrames={SCENES.chat}>
			<ChatScene />
		</TransitionSeries.Sequence>
		<TransitionSeries.Transition
			presentation={slide({direction: 'from-top'})}
			timing={springTiming({durationInFrames: TRANSITION, config: {damping: 200}})}
		/>
		<TransitionSeries.Sequence durationInFrames={SCENES.prompt}>
			<PromptScene />
		</TransitionSeries.Sequence>
		<TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: TRANSITION})} />
		<TransitionSeries.Sequence durationInFrames={SCENES.logo}>
			<LogoScene />
		</TransitionSeries.Sequence>
	</TransitionSeries>
);
