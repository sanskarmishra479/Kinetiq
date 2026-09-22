# Primitives: catalog and reference log

> The motion primitives in [`packages/primitives`](../packages/primitives/) are the building blocks the Scene Coder combines into launch videos ([ARCHITECTURE § 6](ARCHITECTURE.md#6-dynamic-scene-runtime-sandbox)). This file tracks **what we have**, **what we saw in reference videos**, and **what to build next**.

**Status key:** ✅ built · 🔶 partly built (a related primitive exists and needs extending) · 🆕 not built yet · ⏸ paused

## How to use this file

When a new reference video comes in:

1. Break it down frame by frame. Add a section under [Reference log](#3-reference-log) with timestamps and what's on screen.
2. For each primitive you spot, check the [catalog](#2-built-primitives) and the [backlog](#4-backlog).
   - Already built: note it in the reference section. Nothing else to do.
   - In the backlog: add the new reference to its **Seen in** column. More references mean higher priority.
   - Not listed anywhere: add a new row to the backlog.
3. When a primitive is built, move it from the backlog to the catalog, with its demo composition and output file.

Rules every primitive follows (from [TEST_PLAN § 2](TEST_PLAN.md#2-testability-rules-how-we-write-code) and the product decisions):

- Motion math is pure and unit-tested. Motion uses the shared presets in `motion.ts`, and colors and fonts come from `Theme`.
- Few props, good defaults. It must look good with only the required props.
- It works in 16:9, 9:16 and 1:1.
- Legal: no Apple logo, no real macOS wallpapers, no SF Pro font (Inter only), no real app icons or brand logos, no real people's names.
- We copy techniques from references, never their content.

---

## 1. Foundations

| Module | File | What it gives |
|---|---|---|
| Motion presets | `src/motion.ts` | `ease.out/inOut/in`, `springs.snappy/bouncy/gentle`, `dur`, `tween()`, `keyframes()`, `openClose()` |
| Theme | `src/theme.tsx` | `Theme` (the code form of DESIGN.md), `darkCinematic`, `minimalLight`, `ThemeProvider`/`useTheme`, Inter font |
| Color helpers | `src/color.ts` | `luminance()`, `isDark()`: pick light or dark chrome from a theme |

## 2. Built primitives

All files are in `packages/primitives/src/primitives/`. Demos render with `npx remotion render src/entry.ts <Id> out/<file>.mp4`.

| Primitive | Status | What it does | Key props | Demo |
|---|---|---|---|---|
| `Background` | ✅ | Theme background with a slowly drifting accent glow | `glow` | Showcase |
| `Camera` | ✅ | Keyframed pan/zoom with motion blur on fast moves | `shots`, `motionBlur` | Showcase, RefIntro |
| `Cursor` | ✅ | Curved cursor path, click ripple, press squish. `cursorAt()` lets UI react to hover | `path`, `clicks`, `arc`, `hideBefore` | Showcase, RefIntro |
| `Window` | ✅ | Simple macOS app or browser window for a rebuilt UI | `variant`, `title`, `url` | Showcase |
| `Browser` | ✅ | Realistic macOS-style browser: light/dark from the theme, URL types in, load bar, page reveal, scroll with overlay scrollbar, screenshot or rebuilt page, compact chrome in 9:16 | `url`, `typeAt`, `scroll`, `src`, `appearance` | BrowserDemo → `out/browser.mp4`, `out/browser-vertical.mp4` |
| `BlurInText` | ✅ | Text comes into focus by char, word or line (soft, faint and offset, then sharp). `grow` widens the line and keeps it centered. Optional blur-out | `text`, `by`, `grow`, `at`, `exitAt` | BlurInDemo → `out/blur-in.mp4`, `out/blur-in-vertical.mp4` |
| `FocusPull` | ✅ | Whole-scene lens focus in/out, for soft scene changes | `inAt`, `outAt`, `blur` | BlurInDemo |
| `Spotlight` | ✅ | Dims everything except one element, with a glowing accent ring and optional label. Can glide between elements (keyframed rect) | `rect`, `at`, `until`, `label`, `dim` | ProductFocusDemo → `out/product-focus.mp4` |
| `ZoomFocus` | ✅ | Depth of field: camera zooms onto one element, which stays sharp and lifts, while the rest blurs and darkens | `rect`, `at`, `until`, `blur`, `padding` | ProductFocusDemo |
| `CardGrid` | ✅ | Feature cards (icon, title, body) pop in diagonal waves. 3 columns in 16:9, 2 in 1:1 and 9:16. 12 built-in icons | `cards`, `at`, `stagger`, `columns` | ProductFocusDemo, CardGridVertical → `out/card-grid-vertical.mp4` |
| `KineticStack` | ✅ | Stacked bold lines ("LAUNCH / VIDEOS / IN MINUTES") | `lines`, `exitAt` | Showcase |
| `Typewriter` | ✅ | Types text with a caret | `text`, `startAt`, `charsPerSecond` | Showcase |
| `ChatBubble` + `TypingDots` | ✅ | Message bubbles that pop in with a spring. Typing indicator | `text`, `from`, `delay` | Showcase, RefIntro |
| `Captions` | ✅ | Word-by-word captions synced to timings | `words` | Showcase |
| `CaptionPills` | ✅ | Small caption pills for short lines | `lines` | RefIntro |
| `LogoReveal` | ✅ | Logo and tagline end card | `name`, `tagline` | Showcase |
| `Notification` | ✅ | macOS-style banner sliding in from the right | `app`, `title`, `body`, `at` | RefIntro |
| `Menu` (`Chip`, `Dropdown`) | ✅ | Chips and dropdowns that highlight automatically under the cursor | `items`, cursor path | RefIntro |
| `Desktop` (`Wallpaper`, `MenuBar`, `Dock`) | ⏸ | Basic macOS desktop. The "real Mac" upgrade is paused (see backlog) | `clock` | RefIntro |
| `Lens` | ✅ | Barrel distortion and vignette for a curved-glass look | `strength`, `vignette` | RefIntro |

---

## 3. Reference log

Reference videos stay **outside git** (`/mnt/d/Downloads/kinetiq-refs/`). They're copyrighted and large. Only these notes are committed.

### ref-motion: motion.so launch video
`/mnt/d/Downloads/motion-launch.mp4` · 76s · 4K · 30fps · style: **product demo**. Full breakdown in [`what-i-want.md`](../what-i-want.md).

| Time | What's on screen | Primitives |
|---|---|---|
| 0–6s | macOS desktop with posts, chat window and notification. Camera tours and pushes in | Desktop ⏸, Window, ChatBubble, Notification, Camera, Lens |
| 6–24s | Product UI: typing a prompt, dropdowns, preset picker, progress | Camera, Cursor, Menu, Typewriter |
| 26–32s | Chat bubbles pop in with a bounce | ChatBubble |
| 34–40s | Stacked type, typewriter | KineticStack, Typewriter |
| 48–62s | Illustrated scenes in many styles (node diagram, HUD rings, blueprint, cartoon) | NodeGraph 🆕, HUDRings 🆕, DrawPath 🆕 |
| 64–70s | Prompt box, button click, icon row | Cursor, Typewriter |
| 72–76s | Logo morph, end card | LogoReveal, Morph 🆕 |
| Throughout | Word-by-word captions | Captions, CaptionPills |

Recreated as `RefIntro` (first 15s). Side-by-side: `out/compare.mp4`.

### refOne: AI agents launch film
`/mnt/d/Downloads/kinetiq-refs/refOne.mp4` · 50s · 1276×720 · 25fps · style: **cinematic film** (soft light and dark scenes, footage, blur-in type, prism flares).

| Time | What's on screen | Primitives |
|---|---|---|
| 0–3s | "0" → "0." → "0.0" → "0.01%" building up with a glow, over quick footage cuts (moon, sunset, factory, lab) | StatCounter 🔶, FlashCuts 🆕, FootageLayer 🆕 |
| 4–8s | One dot, then a circle of dots grows around it. A pointer dot with a label types in. Earth footage fades in behind | DotField 🆕, BlurInText ✅, FootageLayer 🆕 |
| 8–9s | "We Built" blurs in, big and soft | BlurInText ✅, FocusPull ✅ |
| 9–11s | "Super Computers" with photos and colored bars sliding in behind, and tick rulers above and below | ImageStrip 🆕, TickRuler 🆕 |
| 12–14s | "Just to" repeated above and below, fading. A small "Ask AI" prompt panel | EchoStack 🆕, PromptBar 🔶 |
| 14–17s | "Chat is a TOY" letter by letter. A red brush ribbon sweeps across. Doodles pop in (bulb, star, heart, flame, speech bubble) | BlurInText ✅, WordAccent 🆕, Ribbon 🆕, Doodles 🆕 |
| 17s | Full-screen red/pink color frame as a hard cut | ColorFlash 🆕 |
| 18s | "We demanded ACTION" with a collage of photos | WordAccent 🆕, MediaGrid 🆕 |
| 19–21s | "We didn't build CO-PILOT" swings past in 3D with the ribbon | TextPush 🆕, WordAccent 🆕, Ribbon 🆕 |
| 21–24s | Dark scene: "Because", a dot grid where some dots become glowing pink shapes, "Co Pilots still need a pilot" | DotMatrix 🆕, BlurInText ✅ |
| 24–26s | "We built a workforce" grows word by word. A light panel slides aside to reveal a dark UI | BlurInText ✅ (`grow`), PanelSlide 🆕, Skeleton 🔶 |
| 26–33s | Agent chat UI: user message, agent reply streaming in, tool card, sidebar of agents with status dots and badges. Footage of hands typing in halftone black and white | ChatThread 🔶, SidebarList 🆕, Halftone 🆕, PromptBar 🔶 |
| 33–34s | Slow dip to black | FadeToBlack 🆕 |
| 34–50s | End titles on black, blurring in: title, "comment …", credits, "Book a call…" | TitleCard 🆕 (BlurInText `by="line"` covers most of it) |
| Throughout | Rainbow prism flares drifting, film grain, bright soft center and vignette, a huge blurred brand glyph behind everything, slow camera drift | PrismFlare 🆕, Grain 🆕, Lens 🔶, BrandGlyph 🆕, Camera ✅ |

**Built from this reference:** BlurInText, FocusPull.

---

## 4. Backlog

Priority: **P1** next up · **P2** soon · **P3** later. "Seen in" lists the references that use it. More references mean it's more worth building.

### Text

| Primitive | Status | What it does | Seen in | Priority |
|---|---|---|---|---|
| StatCounter | 🔶 | A number counts or builds up ("0 → 0.01%", "10,000 users"), with a label and glow | refOne, ref-motion idea | P1 |
| WordAccent | 🆕 | One word gets a different style (accent color, caps, huge, marker highlight) | refOne | P1 |
| EchoStack | 🆕 | A phrase repeated above and below itself, fading, like a scrolling list | refOne | P2 |
| TextPush | 🆕 | Text swings in or past with 3D perspective and motion blur | refOne | P2 |
| TitleCard | 🆕 | End-card layout: title and subtitle on black, blur in and out (built on BlurInText) | refOne | P2 |
| MaskReveal | 🆕 | Text slides up from behind an invisible line | idea | P2 |
| ScrambleText | 🆕 | Letters shuffle, then settle on the word (seeded randomness) | idea | P3 |
| WordSwap | 🆕 | One word in a sentence rolls through options | idea | P3 |

### Shapes and graphics

| Primitive | Status | What it does | Seen in | Priority |
|---|---|---|---|---|
| DotField | 🆕 | A dot grows into a circle or grid of dots. Some highlight or move. Pointer dot with a label | refOne | P1 |
| DotMatrix | 🆕 | A dot grid where dots light up into glowing shapes, like an LED display | refOne | P1 |
| Ribbon | 🆕 | A thick brush ribbon sweeps across the frame with motion blur. Can fill the screen as a transition | refOne | P2 |
| Doodles | 🆕 | Our own hand-drawn stickers (bulb, star, heart, flame, bubble) pop in with a wobble | refOne | P2 |
| TickRuler | 🆕 | Rows of small ticks framing a title, sliding in | refOne | P3 |
| BrandGlyph | 🆕 | A huge, soft, blurred version of the customer's logo shape behind every scene | refOne | P1 |
| DrawPath | 🆕 | An SVG line or icon draws itself on | ref-motion | P2 |
| NodeGraph | 🆕 | Boxes connected by lines that draw in, with dots travelling along them | ref-motion | P2 |
| HUDRings | 🆕 | Rotating dashed rings and ticks, for a "tech" look | ref-motion | P3 |
| Morph | 🆕 | One shape smoothly becomes another (e.g. logo morph) | ref-motion | P3 |

### Footage and images
Needs the footage pipeline (customer uploads, free stock, AI images/video → saved to R2 → passed to scenes as URLs, since the render sandbox has no network). Not yet written into ARCHITECTURE.md.

| Primitive | Status | What it does | Seen in | Priority |
|---|---|---|---|---|
| FootageLayer | 🆕 | Full-screen clip with a slow push-in and a color treatment (dim, black & white, duotone) | refOne | P1 |
| FlashCuts | 🆕 | Several clips cut quickly behind text that stays still | refOne | P2 |
| ImageStrip | 🆕 | Photos and color bars slide in one after another behind a title | refOne | P2 |
| MediaGrid | 🆕 | A collage of photos pops in next to a big word | refOne | P2 |
| Halftone | 🆕 | Turns footage into a dot or scanline print look | refOne | P3 |

### Product UI

| Primitive | Status | What it does | Seen in | Priority |
|---|---|---|---|---|
| ChatThread | 🔶 | Agent chat: user message, streamed reply, tool cards (extends ChatBubble) | refOne | P2 |
| SidebarList | 🆕 | App sidebar list with status dots and notification badges | refOne | P2 |
| PromptBar | 🔶 | Prompt or "Ask AI" input that types and submits (extends Typewriter) | refOne, ref-motion | P2 |
| Skeleton | 🔶 | Placeholder bars that grow in, standing in for text | refOne | P3 |
| Mac realism upgrade | ⏸ | Real-resolution desktop, detailed window chrome, original dock icons and wallpaper | ref-motion | P2 |
| Device frames | 🆕 | Code-drawn laptop and phone with 3D tilt | ref-motion | P2 |
| Testimonial | 🆕 | Quote card with an initials avatar and rating | idea | P3 |

### Transitions

| Primitive | Status | What it does | Seen in | Priority |
|---|---|---|---|---|
| PanelSlide | 🆕 | A panel slides aside to reveal the next scene underneath | refOne | P2 |
| ColorFlash | 🆕 | One full-screen color frame as a hard cut on the beat | refOne | P3 |
| FadeToBlack | 🆕 | Slow dip to black | refOne | P3 |
| WhipPan | 🆕 | Fast blurred slide between scenes | idea | P2 |
| ShapeWipe | 🆕 | A circle or logo shape grows to reveal the next scene | idea | P2 |

### Look and texture

| Primitive | Status | What it does | Seen in | Priority |
|---|---|---|---|---|
| PrismFlare | 🆕 | Small rainbow lens flares drifting across the frame | refOne | P1 |
| Grain | 🆕 | Fine film noise (deterministic, seeded) | refOne | P1 |
| Soft light / vignette | 🔶 | Bright soft center and darker edges (extends Lens) | refOne, ref-motion | P2 |

### Sound and system

| Item | Status | What it does | Priority |
|---|---|---|---|
| SFX cues | 🆕 | Whoosh, click, pop and riser timed to primitive events (royalty-free or generated) | P2 |
| Music bed + ducking | 🆕 | Background music that dips under the voiceover | P2 |
| Responsive pass | 🔶 | Every primitive checked in 16:9, 9:16 and 1:1 (Browser and BlurInText already are) | P2 |
| `packages/primitives/API.md` | 🆕 | Compact props and examples for the Scene Coder prompt | P1 before the Scene Coder ships |
| Visual baseline tests | 🆕 | `renderStill` + pixelmatch per primitive at key frames | P2 |
