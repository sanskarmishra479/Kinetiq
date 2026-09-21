import {AbsoluteFill, Series} from 'remotion';
import {CaptionPills} from '../primitives/CaptionPill';
import {Lens} from '../primitives/Lens';
import {AppScene, APP_SCENE} from './AppScene';
import {DesktopScene, DESKTOP_SCENE} from './DesktopScene';

export const REF_INTRO_DURATION = DESKTOP_SCENE + APP_SCENE;

// Recreation of the first 15s of the motion.so launch video, rebranded as Kinetiq.
export const RefIntro: React.FC = () => (
	<AbsoluteFill>
		<Lens>
			<Series>
				<Series.Sequence durationInFrames={DESKTOP_SCENE}>
					<DesktopScene />
				</Series.Sequence>
				<Series.Sequence durationInFrames={APP_SCENE}>
					<AppScene />
				</Series.Sequence>
			</Series>
		</Lens>
		<CaptionPills
			lines={[
				{text: 'you guys really loved', from: 0, to: 22},
				{text: 'my first draft', from: 22, to: 60},
				{text: 'uh oh, time to make a video', from: 104, to: 168},
				{text: "hmm, let's see", from: 180, to: 240},
				{text: 'duration', from: 322, to: 352},
				{text: 'ooh, a custom DESIGN.md', from: 360, to: 425},
				{text: 'ok', from: 436, to: 450},
			]}
		/>
	</AbsoluteFill>
);
