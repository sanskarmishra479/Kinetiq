# Shots: styles, shot recipes and video rules

> How a Kinetiq video is planned so it feels made by a person. The director picks a **style** for the whole video, then a **shot** for each scene; each shot says which [primitives](PRIMITIVES.md) to use, when, and how often. The scene writer never chooses from the whole primitives library at once.
>
> Built from 9 reference videos (see the [reference log](PRIMITIVES.md#3-reference-log)). **Status: proposal for review.** Nothing here is built yet; see [Build order](#8-build-order).

**Status key** for primitives: ✅ built · 🔶 partly built · 🆕 not built. Every shot lists a **fallback** made only of built primitives, so the library works before the new primitives exist.

## 1. The three layers

```
1. Style        calm | energetic | punchy        ← director picks 1 per video
2. Shots        17 recipes (below)               ← director picks 1 per scene, from the style's menu
3. Primitives   the building blocks              ← each recipe names its own; the scene writer only sees those
```

Why: with ~20 primitives today and ~60 in the backlog, a model choosing freely mixes styles, overcrowds scenes and picks the flashy effect over the right one (the first Linear video). Each layer turns one big open choice into a small one with clear rules. It also makes prompts smaller: the scene writer gets its shot's recipe and only the primitives that recipe uses, instead of the whole `API.md` (~5,000 tokens) for every scene.

### What changes in the pipeline

| Node | Today | With shots |
|---|---|---|
| director | scene list with a `purpose` (hook, problem, feature…) and `motion: moving/still` | also picks `style` and a `motif` for the video, and for each scene a `shot` and the transition into it |
| sceneCoder | whole `API.md` + 2 example scenes | the shot's recipe, its primitives' API, the style's motion rules, one example of that shot |
| visualQA | overflow, cut-off text, frozen scene | also the [video rules](#4-video-rules-all-styles): rhythm, accent-colour budget, still ending, overlap |
| renderer transitions | one `focusPush` between every scene | the transition the director picked, from the style's allowed set |

Plan shape (to add to `DirectorPlan` / `SceneBrief` in `packages/shared/src/llm.ts`):

```ts
DirectorPlan += {
  style: 'calm' | 'energetic' | 'punchy';
  motif: {shape: 'circle' | 'arrow' | 'line' | 'square' | 'letter' | 'none'; meaning: string};
}
SceneBrief += {
  shot: ShotId;              // one of the 17 below
  transitionIn: TransitionId; // how this scene arrives (the first scene: 'none')
}
// `purpose` stays: it's what the scene says; `shot` is how it looks.
```

## 2. Styles

The director picks one style per video from: the brand's personality in DESIGN.md, the audience, the user's prompt ("make it calm", "hype"), the ratio, and whether there's music. **Light or dark is not a style**: it comes from the brand's theme, and any style works in both.

| | **Calm** | **Energetic** | **Punchy** |
|---|---|---|---|
| Feels like | premium, confident, story-driven | lively, crafted, flowing | social ad, fast, rhythmic |
| References | Island (refThree), Numtera (saasDemo), vertical | Spotify (refTwo), OpenAI-style (refSix), light theme | Higgsfield (refFour) |
| Camera | **Locked**, or a very slow drift. Closer views come from punch-in cuts or a slow zoom-to-explain; never flies around | One big planned move per act (a scroll, a portal fly-through) plus smooth pushes; still between moves | Snap zooms (2–3 frames) and hard cuts; little drifting |
| Rhythm | Bursts of 0.3–0.6 s, then holds of 1–3 s. About 80% of the time nearly still | Beats of about 1 s; holds of 0.5–1.5 s; one clear motion peak per act | Cuts accelerate (0.5 s → 0.2 s) into a montage, then a hard stop |
| Transitions | Continuity (motif, ShapeMorph), punch-in cut, split wipe, soft focus | ShapeMorph, PortalZoom, CardBurst, 1–2 frame ColorFlash, SnapZoom | Hard cuts on the beat, SnapZoom, ColorFlash, AnchorMontage |
| Easing | Gentle ease-out, no overshoot | Fast out, hard settle; motion blur on fast moves | Snappy; motion blur; slight overshoot allowed |
| Still ending | 2–3 s | at least 1 s | about 2 s |
| Needs | nothing extra | nothing extra | **music with beat times** (Phase 10). Until then, cuts follow a fixed tempo grid, and the director only picks punchy when the user asks |

These replace today's single motion rule ("the camera never locks off" in `packages/primitives/API.md`), which the calm references contradict.

## 3. The shot library

Each shot: what it is, when to use it (and when not), the primitives, how long, the limits per video, which styles may use it, and its fallback with built primitives only. "S/M/L" in *Styles* = calm / energetic / punchy.

### Words

**1. `type-scene`: the words are the scene**
- What: a sentence alone in the centre on the background, built word by word in time with the voice; each phrase replaces the last; one accent word. No UI, no bottom caption.
- Use when: the hook, the turn ("But what if…"), a key claim, the payoff line. Refs: Island 27–34 s, Numtera, vertical.
- Don't: for anything the product UI can show instead; never 3 in a row.
- Primitives: PhraseCards 🆕, WordAccent 🆕, FlowGradient 🔶 (background), GiantType 🆕 (optional beat).
- Length: 1–2.5 s per phrase; 2–6 s per scene.
- Limits: at most 40% of the video's runtime in type scenes.
- Styles: calm, energetic, punchy.
- Fallback: `BlurInText` (`by="word"`, `grow`) on `Background`.

**2. `giant-word`: a one-word beat**
- What: one word so big the frame crops it ("Well…", "But…", "And"), rising or snapping in, 0.5–1 s, then back to normal size or a cut.
- Use when: right before a turn or a reveal, to change the pace.
- Don't: more than once per 15 s; never twice in a row.
- Primitives: GiantType 🆕, SnapZoom 🔶.
- Length: 0.5–1.2 s. Limits: ≤ 1 per 15 s, ≤ 3 per video.
- Styles: calm, energetic, punchy.
- Fallback: `KineticStack` with one line, large.

**3. `word-roll`: one slot, many words**
- What: a sentence with one slot that rolls through options ("One place to [Imagine / Build / Discover]"), or a list scrolling past a fixed marker, the focused item sharp and the rest dim.
- Use when: several benefits, audiences or use cases in one line.
- Primitives: WordSwap 🆕, WordAccent 🆕. Length: 0.6–1 s per word, 3–6 words.
- Limits: 1 per video. Styles: calm, energetic, punchy.
- Fallback: `Typewriter` retyping the last word.

**4. `inline-ui-sentence`: a sentence with product inside it**
- What: a sentence where one "word" is a real UI element (a button, a chip, the app icon: "Meet [icon] Numtera", "We've all pressed this [Button]"). Optionally the camera snaps into that element and the next shot starts there.
- Use when: introducing the product or its key action; the first hook.
- Primitives: InlineUI 🆕, SnapZoom 🔶, BlurInText ✅.
- Length: 2–4 s. Limits: 1–2 per video. Styles: calm, energetic, punchy.
- Fallback: `BlurInText` next to a `Chip`.

### Product

**5. `product-reveal-3d`: the product enters as an object**
- What: the screenshot or rebuilt page rises in as a tilted, turned plane, bends slightly, glides with depth blur on the far edge, then settles face-on, ready to be used. Ref: Numtera 0:16.
- Use when: the first time the product appears; moving to a new page of the product.
- Don't: for every product shot (it's the entrance, not the whole demo).
- Primitives: Screen3D 🆕, FlowGradient 🔶, Browser ✅ or a screenshot.
- Length: 2–3 s. Limits: ≤ 3 per video. Styles: calm, energetic.
- Fallback: `Browser` with `Camera` push-in.

**6. `ui-demo`: the product being used**
- What: rebuilt UI (or the screenshot) where the cursor does one real task: clicks, types, a menu opens, a state changes. One task per shot.
- Use when: every feature the product actually has; most of a SaaS video.
- Don't: show a static screenshot with nothing happening; more than one task per shot.
- Primitives: Cursor ✅, Menu/Chip/Dropdown ✅, Typewriter ✅, Browser ✅/Window ✅, NamedCursor 🔶, Toggle 🔶.
- Length: 3–6 s. Limits: at least one product shot per 15 s when the site has a product UI. Styles: calm, energetic, punchy (shorter).
- Fallback: it's already buildable with built primitives.

**7. `zoom-explain`: look closely at one thing**
- What: the camera dives into the exact field, row or number being talked about (the rest blurs), holds while it types or changes, then pulls back.
- Use when: a detail matters (a setting, a result, a price).
- Primitives: ZoomFocus ✅, Spotlight ✅, Typewriter ✅; in calm style PunchIn 🆕 (a cut instead of a camera move).
- Length: 2–4 s. Limits: ≤ 1 per feature. Styles: calm, energetic.
- Fallback: `ZoomFocus` (built).

**8. `split-contrast`: two sides**
- What: the frame splits with a sliding, glowing edge: light UI on one side, a dark log or result on the other; or before/after.
- Use when: "what happens behind the scenes", old way vs new way.
- Primitives: PanelSlide 🆕, CodeEditor 🆕 (log mode), StatCounter 🔶.
- Length: 3–6 s. Limits: 1 per video. Styles: calm, energetic.
- Fallback: two `Window`s side by side.

**9. `agent-flow`: AI or chat products**
- What: a prompt types into a bar, is sent, and the answer streams in, with tool cards or steps ticking off.
- Use when: the product is an AI, chat or automation tool.
- Primitives: PromptBar 🔶, ChatThread 🔶, ChatBubble ✅, TypingDots ✅, CardBurst 🆕 (the "send" moment).
- Length: 3–6 s. Styles: calm, energetic, punchy.
- Fallback: `Typewriter` + `ChatBubble`.

**10. `code-run`: developer products**
- What: code types into an editor; lines tick green ✓ or red ✗; the scene can tint on an error, then recover.
- Use when: the product is a developer tool, API or infrastructure.
- Primitives: CodeEditor 🆕, ColorFlash 🆕 (state tint).
- Length: 3–5 s. Styles: calm, energetic.
- Fallback: `Window` + `Typewriter`.

### Ideas

**11. `value-graph`: draw the idea**
- What: the product's value as a picture that builds: one point branching to many nodes (icon + label, typed), then gathering ("connected"); or scattered data that something reaches and organises.
- Use when: the product connects, organises or simplifies many things; the problem → solution moment.
- Primitives: NodeGraph 🆕, DrawPath 🆕, DotField 🆕, ShapeMorph 🆕.
- Length: 3–6 s. Limits: 1–2 per video (the second can "rhyme" with the first). Styles: calm, energetic.
- Fallback: `CardGrid` (`list`) building row by row.

**12. `feature-hub`: several features at once**
- What: a central element (a chip, the app icon) with feature widgets popping in around it, each floating on a soft coloured glow; or a clean card grid.
- Use when: 3–5 features that each don't need a full demo.
- Primitives: Orbit layout 🆕, CardGrid ✅, Chip ✅.
- Length: 3–5 s. Limits: 1 per video. Styles: calm, energetic.
- Fallback: `CardGrid` (built; `grid` or `bento`).

**13. `proof-numbers`: scale and results**
- What: a number counts up with a label ("10,000 teams", "$149 → $0.32"), or a field of labelled points.
- Use when: the site has real numbers (users, savings, speed). Never invented numbers.
- Primitives: StatCounter 🔶, DotField 🆕.
- Length: 2–4 s. Limits: only with numbers from the research. Styles: calm, energetic, punchy.
- Fallback: `KineticStack` with the number.

**14. `photo-moment`: warmth**
- What: the product UI in a frosted-glass card, or a line of text, over a real photograph (landscape, sky, a scene that fits the brand).
- Use when: a calm breath between graphic scenes; lifestyle or consumer products.
- Primitives: FootageLayer 🆕, GlassCard 🆕.
- Needs: licensed images (see [open questions](#9-open-questions)).
- Length: 2–4 s. Limits: ≤ 3 per video. Styles: calm, energetic.
- Fallback: skip; use `type-scene` instead.

**15. `anchor-montage`: fast variations**
- What: hard cuts every 0.2–0.5 s between variations of the same subject in the same place and size (many buttons, one image in many styles), speeding up, then a hard stop.
- Use when: showing breadth ("works with every…", "all your tools"). Punchy only.
- Primitives: AnchorMontage 🆕, BeatSync 🆕.
- Length: 2–4 s. Limits: 1 per video. Styles: punchy.
- Fallback: none; the director doesn't pick it until it's built.

### Endings

**16. `logo-payoff`: the motif becomes the logo**
- What: the video's motif (or the last scene's element) turns into the logo mark; the name arrives; then a still hold.
- Use when: every video ends with it (or with `cta-end`).
- Primitives: LogoReveal ✅, BrandMotif 🆕, ShapeMorph 🆕.
- Length: 2–4 s, **ending in a still hold** (style's length). Limits: exactly 1. Styles: calm, energetic, punchy.
- Fallback: `LogoReveal` (built).

**17. `cta-end`: the call to action**
- What: "Start a free trial" / the URL / the handle, typed with a caret or on a full-bleed brand-colour card.
- Use when: the user wants a call to action, or it's a social (9:16) video.
- Primitives: Typewriter ✅, FullBleedEnd 🆕, FlowGradient 🔶.
- Length: 2–3 s, then still. Limits: 1. Styles: calm, energetic, punchy.
- Fallback: `Typewriter` on `Background`.

### Typical arcs

The director doesn't have to follow these, but they're good defaults (seen in almost every reference):

| Length | Arc |
|---|---|
| 15–30 s | `type-scene` or `inline-ui-sentence` (hook) → `product-reveal-3d` → `ui-demo` ×2 → `type-scene` (claim) → `logo-payoff` |
| 30–45 s | hook → problem (`type-scene` / `value-graph`) → `giant-word` (turn) → `product-reveal-3d` → `ui-demo` ×2–3 → `zoom-explain` → `feature-hub` → `logo-payoff` → `cta-end` |
| 45–60 s | as 30–45 s, plus `split-contrast` or `agent-flow`, `proof-numbers`, a `photo-moment` breath, and a second `value-graph` that rhymes with the first |

## 4. Video rules (all styles)

Checked by the director's plan validation and by visual QA. Each rule has a measurable check.

| Rule | Why (refs) | Check |
|---|---|---|
| **Story arc:** a hook, a turn, the product, a payoff | every reference | plan: the first scene is a hook shot; a product shot comes before the last third; the video ends with `logo-payoff` or `cta-end` |
| **Holds you can read:** every scene has at least one hold (≥ 0.8 s calm, ≥ 0.5 s energetic) | our Linear video never rested | motion sampling: consecutive frames nearly unchanged for the hold length (replaces today's "must always move" check) |
| **Still ending** | every reference ends still (1.2–3 s) | the last N frames nearly unchanged |
| **Accent colour as light:** the brand's accent covers ≤ 5% of the frame, except a full-bleed end card and 1–2 frame flashes; glow tints don't count | Spotify: bright green < 1%; the lime Linear video | pixel count per sampled frame |
| **One motif** per video, from the brand's own mark; `none` is allowed | Island, light theme, OpenAI-style | plan: at most one motif |
| **One transition family + one signature move** | every reference is consistent | plan: transitions come from the style's set; the signature (e.g. PortalZoom) at most twice |
| **No bottom captions by default** | no reference has them | captions only when the user switches them on |
| **Nothing overlaps, nothing is cut off** (except GiantType, which is cropped on purpose) | first Linear video | existing visual QA + an overlap check |
| **Real brand colours** | Linear came out lime | theme from the scraped brand colours, not an invented accent |
| **Length range:** 15–30 / 30–45 / 45–60 s; the story decides the exact length | product decision | plan: total within the chosen range |

## 5. Transitions

| Family | Transitions | Styles |
|---|---|---|
| Continuity | ShapeMorph 🆕 (an element becomes the next shot's element), motif collapse/grow 🆕 | all |
| Camera | PunchIn cut 🆕, SnapZoom 🔶, PortalZoom 🆕, zoom-explain (ZoomFocus ✅) | calm: PunchIn · energetic: PortalZoom, SnapZoom · punchy: SnapZoom |
| Wipes | PanelSlide 🆕 (incl. split with a glowing edge), ColorFlash 🆕 (1–2 frames) | energetic, punchy (calm: PanelSlide only) |
| Soft | FocusPull ✅, `focusPush` ✅ (today's default) | calm, energetic |
| Glitch | GlitchSelect 🆕 (select → delete → retype) | energetic, punchy |

Rule of thumb from the references: **a transition should carry something across** (an element, the motif, the camera's direction). A plain crossfade is the last resort.

## 6. Vertical (9:16)

From the vertical reference and the platforms' own UI:
- **One centre column.** Content stays in the middle band of the frame, clear of the top ~12% and bottom ~20% where Instagram, TikTok and Shorts put their own buttons and captions.
- **Narrow text blocks:** 2–4 short lines, larger text than in 16:9 (it's watched on a phone).
- **Cards at ~75% of the width**, then the camera pushes in until they fill it.
- **Stack vertically:** word rolls, lists and steps run top to bottom.
- Best shots: `type-scene`, `inline-ui-sentence`, `ui-demo` (phone-sized UI), `word-roll`, `cta-end` (full-bleed brand colour with the handle).
- Styles: calm (one-take chain of morphs) or punchy.

## 7. What each role receives

| Role | Gets |
|---|---|
| director | the style table, the 17 shots (name, use when, don't, limits, styles), the typical arcs, the video rules. Not the primitives' API |
| sceneCoder | its scene's brief, the style's motion rules, its **shot recipe**, the API of **only that shot's primitives**, one example scene of that shot, the theme |
| sceneFix | the same, plus the QA problems |
| visualQA | the shot's intent ("should hold still at the end", "GiantType is cropped on purpose") so it doesn't flag intended effects |

## 8. Build order

**Step 1: the layers, with built primitives only** (no new primitives needed; every shot uses its fallback):
1. Plan schema: `style`, `motif`, `shot`, `transitionIn`; director prompt with the tables above; plan validation for the video rules that are checkable on the plan.
2. Shot recipes as data in the worker (`prompts/shots.ts`): one entry per shot, with its primitives list, and an example scene for the most used ones.
3. Split `API.md` per primitive, so the scene writer's prompt only carries its shot's primitives.
4. Visual QA: the rhythm check (holds and still ending) replaces "must always move"; accent-colour budget; overlap check.
5. Real brand colours (the Linear lime fix) and the style's transitions in the renderer.
6. Tests for each (TEST_PLAN), then one paid run to compare with the first Linear video.

**Step 2: new primitives, in the order of how many shots they unlock** (for the primitives session):

| Order | Primitive | Unlocks | Seen in |
|---|---|---|---|
| 1 | FlowGradient | background of type, product and end shots | 3 refs |
| 2 | PhraseCards | `type-scene` | Island, vertical, Numtera |
| 3 | Screen3D | `product-reveal-3d` | Numtera |
| 4 | ShapeMorph | continuity transitions everywhere | 7 of 9 refs |
| 5 | GiantType | `giant-word`, `type-scene` beats | 3 refs |
| 6 | WordSwap | `word-roll` | 4 refs |
| 7 | InlineUI + SnapZoom preset + PunchIn | `inline-ui-sentence`, camera transitions | 3–4 refs |
| 8 | BrandMotif | the motif and `logo-payoff` | 3 refs |
| 9 | NodeGraph + DrawPath | `value-graph` | 3 refs |
| 10 | PanelSlide, ColorFlash, WordAccent | transitions, accents | 4 refs each |
| later | GlassCard, FootageLayer (needs images), CodeEditor, PromptBar, AnchorMontage + BeatSync (needs music, Phase 10), the rest of the backlog | | |

## 9. Open questions

1. **Photos** (`photo-moment`, GlassCard over a landscape): the references lean on real photography. Options: free stock with an API (Unsplash or Pexels: free, attribution rules to check), AI-generated images (costs per image), or only the customer's uploads. Which do you want?
2. **Motif shape:** the motif should come from the brand's logo, but we don't fetch the logo (a security rule: the site controls that URL). Options: the director picks a simple shape from the brand name and the screenshot (circle, arrow, line, square, first letter), or the user uploads the logo. The first works automatically; the second is more accurate.
3. **Punchy style before music exists:** allow it only when the user asks (cuts on a fixed tempo grid), or hide it until Phase 10 adds music with beat times?
4. **Shot names and the 17 recipes:** anything missing from the videos you want Kinetiq to make, or anything here you'd never want?
