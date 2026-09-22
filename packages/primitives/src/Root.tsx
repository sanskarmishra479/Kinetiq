import {BlurInDemo, BLUR_IN_DEMO_DURATION} from './showcase/BlurInDemo';
import {Composition, Folder} from 'remotion';
import {
	BrowserDemo,
	BrowserDemoVertical,
	BROWSER_DEMO_DURATION,
	BROWSER_VERTICAL_DURATION,
} from './showcase/BrowserDemo';
import {RefIntro, REF_INTRO_DURATION} from './ref/RefIntro';
import {Showcase, SHOWCASE_DURATION} from './showcase/Showcase';
import {ChatScene, LogoScene, ProductScene, PromptScene, SCENES, TitleScene} from './showcase/scenes';

const video = {fps: 30, width: 1920, height: 1080};

export const Root: React.FC = () => (
	<>
		<Composition id="Showcase" component={Showcase} durationInFrames={SHOWCASE_DURATION} {...video} />
		<Composition id="RefIntro" component={RefIntro} durationInFrames={REF_INTRO_DURATION} {...video} />
		<Folder name="Primitives">
			<Composition id="BlurInDemo" component={BlurInDemo} durationInFrames={BLUR_IN_DEMO_DURATION} {...video} />
			<Composition
				id="BlurInDemoVertical"
				component={BlurInDemo}
				durationInFrames={BLUR_IN_DEMO_DURATION}
				fps={30}
				width={1080}
				height={1920}
			/>
			<Composition id="BrowserDemo" component={BrowserDemo} durationInFrames={BROWSER_DEMO_DURATION} {...video} />
			<Composition
				id="BrowserDemoVertical"
				component={BrowserDemoVertical}
				durationInFrames={BROWSER_VERTICAL_DURATION}
				fps={30}
				width={1080}
				height={1920}
			/>
		</Folder>
		<Folder name="Scenes">
			<Composition id="Title" component={TitleScene} durationInFrames={SCENES.title} {...video} />
			<Composition id="Product" component={ProductScene} durationInFrames={SCENES.product} {...video} />
			<Composition id="Chat" component={ChatScene} durationInFrames={SCENES.chat} {...video} />
			<Composition id="Prompt" component={PromptScene} durationInFrames={SCENES.prompt} {...video} />
			<Composition id="Logo" component={LogoScene} durationInFrames={SCENES.logo} {...video} />
		</Folder>
	</>
);
