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

## Four kinds of primitives

Not every primitive should follow the brand. Each one is one of four kinds. The kind is written in its source comment, so it also appears in the generated `packages/primitives/API.md` that the Scene Coder reads.

| Kind | What it is | What the theme may change | Examples |
|---|---|---|---|
| **Brand-styled** | The designer's own graphics | Everything: colors, fonts, palette, surface, borders, shadows | BlurInText, CardGrid, KineticStack, Captions, LogoReveal, Background |
| **Product UI** | Stand-ins for the customer's own interface | Styled like the product (usually the same theme) | Chip, Dropdown, the page inside a Browser or Window |
| **Real-world replica** | Copies of things everyone knows (OS and browser chrome) | Only light/dark mode (picked from the theme background), plus the accent on small focus details. Always the system font (Inter) | Browser, Window, Desktop (Wallpaper, MenuBar, Dock), Notification, Cursor |
| **Motion-only** | Moves, blurs or frames what's inside; no look of its own | Nothing visual (Spotlight uses only the accent) | Camera, FocusPull, ZoomFocus, Spotlight, Lens |

**Rules:**
- Never restyle a real-world replica with brand fonts, colors, corners or shadows. Their job is to look real, and restyling breaks that.
- What's shown *inside* a replica is the product. It follows the product's real look, not the video's style.
- Planned: a theme **energy** setting (calm / normal / playful) that picks the spring and easing presets, so motion-only primitives also move in the brand's personality. The references show it should be a whole **style profile**, not just easing: refTwo is energetic (camera moves, morphs), refThree is calm (locked camera, punch-in cuts, long holds). See [Style profile](#sound-and-system).

---

## 1. Foundations

| Module | File | What it gives |
|---|---|---|
| Motion presets | `src/motion.ts` | `ease.out/inOut/in`, `springs.snappy/bouncy/gentle`, `dur`, `tween()`, `keyframes()`, `openClose()` |
| System font | `src/fonts.ts` | `systemFont` (Inter): the font every real-world replica uses, whatever the brand font is. Internal, not exported to scenes |
| Theme | `src/theme.tsx` | `Theme` (the code form of DESIGN.md), `darkCinematic`, `minimalLight`, `ThemeProvider`/`useTheme`, Inter font. Optional brand personality: `headingFont`, `palette` (2–4 colors) and `style` (`surface` solid/outline/tint/brand, `border` none/hairline/bold, `shadow` none/soft/hard, heading weight and tracking). `resolveStyle()`/`useThemeStyle()` fill in defaults |
| Color helpers | `src/color.ts` | `luminance()`, `isDark()`: pick light or dark chrome from a theme |

## 2. Built primitives

All files are in `packages/primitives/src/primitives/`. Demos render with `npx remotion render src/entry.ts <Id> out/<file>.mp4`.

| Primitive | Status | Kind | What it does | Key props | Demo |
|---|---|---|---|---|---|
| `Background` | ✅ | Brand | Theme background with a slowly drifting accent glow | `glow` | Showcase |
| `Camera` | ✅ | Motion | Keyframed pan/zoom with motion blur on fast moves | `shots`, `motionBlur` | Showcase, RefIntro |
| `Cursor` | ✅ | Replica | Curved cursor path, click ripple, press squish. `cursorAt()` lets UI react to hover | `path`, `clicks`, `arc`, `hideBefore` | Showcase, RefIntro |
| `Window` | ✅ | Replica | Simple macOS app or browser window for a rebuilt UI | `variant`, `title`, `url` | Showcase |
| `Browser` | ✅ | Replica | Realistic macOS-style browser: light/dark from the theme, URL types in, load bar, page reveal, scroll with overlay scrollbar, screenshot or rebuilt page, compact chrome in 9:16 | `url`, `typeAt`, `scroll`, `src`, `appearance` | BrowserDemo → `out/browser.mp4`, `out/browser-vertical.mp4` |
| `BlurInText` | ✅ | Brand | Text comes into focus by char, word or line (soft, faint and offset, then sharp). `grow` widens the line and keeps it centered. Optional blur-out | `text`, `by`, `grow`, `at`, `exitAt` | BlurInDemo → `out/blur-in.mp4`, `out/blur-in-vertical.mp4` |
| `FocusPull` | ✅ | Motion | Whole-scene lens focus in/out, for soft scene changes | `inAt`, `outAt`, `blur` | BlurInDemo |
| `Spotlight` | ✅ | Motion | Dims everything except one element, with a glowing accent ring and optional label. Can glide between elements (keyframed rect) | `rect`, `at`, `until`, `label`, `dim` | ProductFocusDemo → `out/product-focus.mp4` |
| `ZoomFocus` | ✅ | Motion | Depth of field: camera zooms onto one element, which stays sharp and lifts, while the rest blurs (12px on screen, whatever the zoom) and darkens a little | `rect`, `at`, `until`, `blur`, `padding` | ProductFocusDemo |
| `CardGrid` | ✅ | Brand | Feature cards styled by the brand, not one template. Layouts: `grid` (equal cards, diagonal waves), `bento` (one big hero card in a brand color), `list` (typographic rows, dividers draw in), `steps` (numbered, only for real sequences). Fill, border, shadow, fonts and colors come from the theme style. 12 built-in icons | `cards`, `variant`, `at`, `stagger`, `columns` | BrandStylesDemo → `out/brand-styles.mp4`, `out/brand-styles-vertical.mp4`; ProductFocusDemo; CardGridVertical |
| `KineticStack` | ✅ | Brand | Stacked bold lines ("LAUNCH / VIDEOS / IN MINUTES") | `lines`, `exitAt` | Showcase |
| `Typewriter` | ✅ | Brand | Types text with a caret | `text`, `startAt`, `charsPerSecond` | Showcase |
| `ChatBubble` + `TypingDots` | ✅ | Brand | Message bubbles that pop in with a spring. Typing indicator | `text`, `from`, `delay` | Showcase, RefIntro |
| `Captions` | ✅ | Brand | Word-by-word captions synced to timings | `words` | Showcase |
| `CaptionPills` | ✅ | Brand | Small caption pills for short lines | `lines` | RefIntro |
| `LogoReveal` | ✅ | Brand | Logo and tagline end card | `name`, `tagline` | Showcase |
| `Notification` | ✅ | Replica | macOS-style banner sliding in from the right | `app`, `title`, `body`, `at` | RefIntro |
| `Menu` (`Chip`, `Dropdown`) | ✅ | Product UI | Chips and dropdowns that highlight automatically under the cursor | `items`, cursor path | RefIntro |
| `Desktop` (`Wallpaper`, `MenuBar`, `Dock`) | ⏸ | Replica | Basic macOS desktop. The "real Mac" upgrade is paused (see backlog) | `clock` | RefIntro |
| `Lens` | ✅ | Motion | Barrel distortion and vignette for a curved-glass look | `strength`, `vignette` | RefIntro |

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

### refTwo: Spotify "Purity of Motion"
`/mnt/d/Downloads/kinetiq-refs/refTwo.mp4` · 8.9s · 1276×718 · 30fps · style: **energetic brand spot** (black, green glow, camera moves, morph transitions). What the user liked: the camera, the smoothness, the transitions between frames, and the brand-true colours.

| Time | What's on screen | Primitives |
|---|---|---|
| 0.0–0.4s | Logo drops in from the top, flipping on its X axis with motion blur. A green glow blooms behind it | FlipDrop 🆕, Background ✅ |
| 0.4–1.2s | "Purity of Motion." slides in word by word, blur to sharp. "of" is smaller (mixed sizes) | BlurInText ✅, WordAccent 🆕 |
| 1.2–1.7s | A pill outline wraps the lockup, shrinks into a circle, and the circle becomes the next shot's album cover | ShapeMorph 🆕 |
| 1.7–2.5s | Three round covers; the centre one gets a green ring, the sides dim | CarouselFocus 🆕 |
| 2.0–3.3s | Headline blurs in letter by letter, paragraph line by line, a "Go beyond" chip swings in tilted and straightens | BlurInText ✅, Chip ✅, TiltSettle 🆕 |
| 3.3–4.1s | The one big move: the camera scrolls down the page and track rows stream up, edge rows dimmed | ScrollThrough 🔶, Camera ✅ |
| 4.1–5.0s | Chips pop in (All → Friends → Podcasts) and the green "selected" state hops from chip to chip | ActiveTravel 🔶 |
| 5.0–5.5s | Everything else fades, "Podcasts" centres, the glow swells into a ring and swallows it; new text rises out of the dark | GlowDive 🆕 |
| 5.5–6.7s | Reading holds: "More than just audio", "Its an experience" (blur-in while letter spacing tightens) | BlurInText 🔶 (tracking ease) |
| 6.7–8.9s | Logo pops, wordmark wipes in, then ~1.2s of complete stillness | LogoReveal ✅ |

**Measured:**
- Motion: gentle for 0–3s, one peak at 3.3–4.0s (the scroll), calm reading holds, a completely still last 1.2s. One climax, not constant motion.
- Colour: 68% pure black, ~26% very dark green (the glow), bright green under 1% (logo, selected chip, focus ring). **Brand colour is used as light and small accents, never as big fills.**

**Lessons:** something from each shot turns into the next one (no hard cuts, no plain fades); fast moves carry motion blur and arrive with a hard ease-out; focus comes from dimming the rest.

### refThree: Island "The Control Plane for the Agentic Enterprise"
`/mnt/d/Downloads/kinetiq-refs/refThree.mp4` · 103s · 1276×720 · 25fps · style: **calm story film** (locked camera, one brand motif, cream / nature photos / dark teal). What the user liked: the stable camera, and one dot carrying through every frame. The lesson is the *motif principle*, **not** "use dots in every video".

| Time | What's on screen | Primitives |
|---|---|---|
| 0–2s | "Let's / talk / about" as a bulleted list building up, then "Agents" huge and cropped by the frame | BlurInText ✅, GiantType 🆕 |
| 2–4s | Agents as soft gradient orbs with status labels ("Planning…", "Reviewing…"), more and more appear | Orb 🆕 |
| 4–6s | "They're everywhere now": a dot field fills the screen around the text | DotField 🆕 |
| 6–7s | Glimpses of agents inside apps (doc, dashboard, terminal typing), then the UI collapses into one dot | Window ✅, Typewriter ✅, BrandMotif 🆕 |
| 7–9s | "Except your agent are your people": scattered words drift on arcs and settle into one line; "aren't" in red, underlined | WordsSettle 🆕, WordAccent 🆕 |
| 10–14s | The sentence collapses into a row of filled/hollow dots, which become a conveyor of agents passing "Onboarding" and "Training" rows that flip to ✕ Skipped | BrandMotif 🆕, DataTable 🆕 |
| 14–16s | Dots circle "Finalizing…" and squeeze into a "Done." pill → "Done. Their way." | LoaderRing 🆕, ShapeMorph 🆕 |
| 17–20s | A dotted path with dots travelling along it; waypoint icons turn red one by one | PathTravel 🆕 |
| 20–23s | Identities (API key, Ella S., service account, token) with filled/hollow status dots, which then carry badges | DotField 🆕, NodeGraph 🆕 |
| 23–25s | Dashboard cards fill with data, big blurred dots in front and behind for depth | Bokeh 🆕, CardGrid ✅ |
| 25–27s | "Planning…", "Invoking tool…" with red cost counters rolling (-$0.42 → -$129) | StatCounter 🔶 |
| 27–34s | "But what if there was a way…" word by word, "your terms?" tinted, "Well…" huge, "well… there is." | BlurInText ✅, GiantType 🆕, WordAccent 🆕 |
| 34–38s | Hard cut to a landscape photo: Island logo, then "The *Control Plane* for the Agentic Enterprise"; a glass pill sweeps across and tints "Control Plane" | FootageLayer 🆕, HighlightSweep 🆕 |
| 38–42s | Frosted-glass platform ring over the landscape, slowly rotating | GlassCard 🆕, HUDRings 🆕 |
| 42–51s | White dots on dark line up and reveal a table card over a landscape; AI apps, MCP servers, AI skills tables; a punch-in cut to a close-up of risk badges | GlassCard 🆕, DataTable 🆕, PunchIn 🆕 |
| 51–60s | Orbs in the sky become app cards (GitHub, Salesforce, HomeOps); an Identity Gateway panel with toggles flipped by a named cursor | BrandMotif 🆕, Toggle 🔶, NamedCursor 🔶 |
| 60–75s | The sun beside the app icon; a dark chat app types a question; tool call blocked; an insight card | ChatThread 🔶, PromptBar 🔶, Notification ✅ |
| 75–92s | Sessions and model-cost tables; the cursor switches the model and the cost drops $149 → $0.32; threat dashboard | NamedCursor 🔶, Dropdown ✅, StatCounter 🔶, PunchIn 🆕 |
| 92–96s | Dark teal: "So your [Writing / Researching…] and your people" with a rolling word; "get the job *done*" chip ticks | WordSwap 🆕, Checkbox 🔶 |
| 96–98s | Giant cropped type, then "the future of *enterprise work* arrived early." | GiantType 🆕, WordAccent 🆕 |
| 98–103s | A white dot rises into the text, flashes through three landscapes, becomes the logo mark → "Island" → island.io, held still | BrandMotif 🆕, FlashCuts 🆕, LogoReveal ✅ |

**Measured:**
- Motion: about 80% of seconds are almost still. Movement comes in 0.3–0.6s bursts followed by 1–3s holds (a pulse). The camera never flies: closer views are **punch-in cuts** (45.6s: the wide table holds ~0.9s, then a cut to a tight crop). About 15 hard cuts, each on a beat. The last ~3s are completely still.
- Colour: warm cream `#F1EDE9` (problem act), dark teal-black `#061615` (payoff), nature photos behind frosted-glass UI (product act). Accents are tiny and mean something: soft red = danger, mint = safe, pastel orbs = agents. The three colour worlds follow the three acts.
- Type: one neutral sans plus an *italic serif* accent word for emphasis.

**Lessons:** the brand motif (here the logo's circle) is given a meaning, carried through almost every transition (the outgoing shot collapses into it, the next grows out of it) and paid off by becoming the logo. For other brands the motif comes from their own mark. The story has a turn ("But what if… Well… there is."); one idea per shot, lots of empty space.

### Across references
- Shared by all: something from the outgoing shot carries into the next one; holds long enough to read; a still ending; brand colour as accent or light, never big fills; one idea per beat.
- They differ in energy: pick a style profile per brand or prompt (energetic like refTwo, calm like refThree) instead of one fixed motion rule.

---

## 4. Backlog

Priority: **P1** next up · **P2** soon · **P3** later. "Seen in" lists the references that use it. More references mean it's more worth building.

### Text

| Primitive | Status | What it does | Seen in | Priority |
|---|---|---|---|---|
| StatCounter | 🔶 | A number counts or builds up ("0 → 0.01%", "10,000 users"), with a label and glow. Can roll and shift colour (red costs climbing) | refOne, refThree, ref-motion idea | P1 |
| WordAccent | 🆕 | One word gets a different style (accent color, caps, huge, marker highlight, *italic serif*, red underline, smaller "of") | refOne, refTwo, refThree | P1 |
| EchoStack | 🆕 | A phrase repeated above and below itself, fading, like a scrolling list | refOne | P2 |
| TextPush | 🆕 | Text swings in or past with 3D perspective and motion blur | refOne | P2 |
| TitleCard | 🆕 | End-card layout: title and subtitle on black, blur in and out (built on BlurInText) | refOne | P2 |
| MaskReveal | 🆕 | Text slides up from behind an invisible line | idea | P2 |
| ScrambleText | 🆕 | Letters shuffle, then settle on the word (seeded randomness) | idea | P3 |
| WordSwap | 🆕 | One word in a sentence rolls through options | refThree | P2 |
| GiantType | 🆕 | A word so big the frame crops it, as punctuation between beats | refThree | P2 |
| WordsSettle | 🆕 | Scattered words drift on arcs and settle into one sentence | refThree | P3 |
| FlipDrop | 🆕 | An element (logo, word) drops in flipping on its X axis with motion blur and a glow bloom | refTwo | P2 |
| Tracking ease | 🔶 | Letter spacing tightens as text blurs in (extends BlurInText) | refTwo | P3 |

### Shapes and graphics

| Primitive | Status | What it does | Seen in | Priority |
|---|---|---|---|---|
| DotField | 🆕 | A dot grows into a circle or grid of dots, or fills the screen as a crowd. Some highlight, move, or show filled/hollow status. Pointer dot with a label | refOne, refThree | P1 |
| DotMatrix | 🆕 | A dot grid where dots light up into glowing shapes, like an LED display | refOne | P1 |
| Ribbon | 🆕 | A thick brush ribbon sweeps across the frame with motion blur. Can fill the screen as a transition | refOne | P2 |
| Doodles | 🆕 | Our own hand-drawn stickers (bulb, star, heart, flame, bubble) pop in with a wobble | refOne | P2 |
| TickRuler | 🆕 | Rows of small ticks framing a title, sliding in | refOne | P3 |
| BrandGlyph | 🆕 | A huge, soft, blurred version of the customer's logo shape behind every scene | refOne | P1 |
| BrandMotif | 🆕 | **One shape from the customer's logo that carries meaning through the whole video**: scenes collapse into it and grow out of it, and it becomes the logo at the end. The shape comes from each brand's mark (never dots by default) | refThree, refOne | P1 |
| Orb | 🆕 | Soft gradient orb with a status label, standing in for an agent or persona | refThree | P2 |
| LoaderRing | 🆕 | Dots circle a label, then squeeze into a pill or button | refThree | P3 |
| PathTravel | 🆕 | A dotted route with dots travelling along it; waypoint icons change state | refThree | P2 |
| DrawPath | 🆕 | An SVG line or icon draws itself on | ref-motion | P2 |
| NodeGraph | 🆕 | Boxes connected by lines that draw in, with dots travelling along them | ref-motion, refThree | P2 |
| HUDRings | 🆕 | Rotating dashed rings and ticks, for a "tech" look (also as a glass platform ring) | ref-motion, refThree | P3 |
| Morph | 🆕 | One shape smoothly becomes another (e.g. logo morph). See ShapeMorph under Transitions | ref-motion, refTwo, refThree | P1 |

### Footage and images
Needs the footage pipeline (customer uploads, free stock, AI images/video → saved to R2 → passed to scenes as URLs, since the render sandbox has no network). Not yet written into ARCHITECTURE.md.

| Primitive | Status | What it does | Seen in | Priority |
|---|---|---|---|---|
| FootageLayer | 🆕 | Full-screen clip or photo with a slow push-in and a color treatment (dim, black & white, duotone). Nature photos as the backdrop for UI | refOne, refThree | P1 |
| FlashCuts | 🆕 | Several clips cut quickly behind text that stays still (or inside a growing motif) | refOne, refThree | P2 |
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
| GlassCard | 🆕 | Frosted-glass card holding product UI over a photo backdrop | refThree | P1 |
| DataTable | 🆕 | Clean table with coloured badges (CRITICAL/MEDIUM/LOW) and status cells that flip | refThree | P2 |
| NamedCursor | 🔶 | Cursor with a persona name tag ("Sarah", "Admin") (extends Cursor) | refThree | P2 |
| Toggle / Checkbox | 🔶 | Switches that flip and tick boxes that check under the cursor (extends Menu) | refThree | P2 |
| ActiveTravel | 🔶 | The selected state hops across a row of chips or tabs (extends Chip) | refTwo | P2 |
| CarouselFocus | 🆕 | A row of items; the centre one is ringed and the sides dim | refTwo | P3 |
| ScrollThrough | 🔶 | A long list or page streams past under the camera, edge rows dimmed (extends Browser scroll) | refTwo | P2 |

### Transitions

| Primitive | Status | What it does | Seen in | Priority |
|---|---|---|---|---|
| PanelSlide | 🆕 | A panel slides aside to reveal the next scene underneath | refOne | P2 |
| ColorFlash | 🆕 | One full-screen color frame as a hard cut on the beat | refOne | P3 |
| FadeToBlack | 🆕 | Slow dip to black | refOne | P3 |
| WhipPan | 🆕 | Fast blurred slide between scenes | idea | P2 |
| ShapeWipe | 🆕 | A circle or logo shape grows to reveal the next scene | idea, refThree | P2 |
| ShapeMorph | 🆕 | **Continuity transition:** an element of the outgoing shot becomes the next shot's element (lockup → pill → circle → cover; UI → dot → text) | refTwo, refThree | P1 |
| PunchIn | 🆕 | Hard cut from a wide shot to a tight crop of the same UI, then a very slow drift (locked-camera style) | refThree | P1 |
| GlowDive | 🆕 | The background glow swells into a ring and swallows an element; new content rises out of the dark | refTwo | P2 |

### Look and texture

| Primitive | Status | What it does | Seen in | Priority |
|---|---|---|---|---|
| PrismFlare | 🆕 | Small rainbow lens flares drifting across the frame | refOne | P1 |
| Grain | 🆕 | Fine film noise (deterministic, seeded) | refOne | P1 |
| Soft light / vignette | 🔶 | Bright soft center and darker edges (extends Lens) | refOne, ref-motion | P2 |
| Bokeh | 🆕 | Big blurred shapes in front of and behind the UI for depth | refThree | P3 |
| MotionBlur helper | 🔶 | Motion blur for any fast-moving element, not only the camera (Camera has it) | refTwo | P2 |

### Sound and system

| Item | Status | What it does | Priority |
|---|---|---|---|
| Style profile | 🆕 | Energetic (camera moves, morphs, one motion peak) or calm (locked camera, punch-in cuts, pulse rhythm, long holds), chosen by the director per brand or prompt; replaces the planned "energy" setting | P1 |
| SFX cues | 🆕 | Whoosh, click, pop and riser timed to primitive events (royalty-free or generated) | P2 |
| Music bed + ducking | 🆕 | Background music that dips under the voiceover | P2 |
| Responsive pass | 🔶 | Every primitive checked in 16:9, 9:16 and 1:1 (Browser and BlurInText already are) | P2 |
| `packages/primitives/API.md` | ✅ | Compact props and examples for the Scene Coder prompt, generated from the source (Phase 7) | done |
| Visual baseline tests | ✅ | `renderStill` + pixelmatch per primitive at key frames (`packages/primitives/visual-baselines`, Phase 7) | done |
