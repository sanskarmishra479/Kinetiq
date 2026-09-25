# PRD: Product Requirements Document

**Kinetiq** (kinetiq.so): *URL to video.*
**Status:** Draft v1 · **Owner:** Founder · **Last updated:** 2026-09-21

← [README](README.md) · **PRD** · [SRS →](SRS.md)

---

## 1. Problem

Every startup needs a launch video for Product Hunt, X, LinkedIn and its landing page. Today there are three options:

| Option | Problem |
|---|---|
| Hire a motion designer | $500–$5,000 and 1–3 weeks. Most early startups can't afford it. |
| Do it yourself (After Effects, Figma, Canva) | Takes days to learn, and results look amateur. |
| AI video tools (text-to-video models) | They **hallucinate UI, text and logos**. You can't show your real product. |

**The gap:** nothing turns a product into a *premium*, *on-brand*, *accurate* launch video in minutes.

## 2. Solution

The user pastes their URL, and optionally adds screenshots, a screen recording, a reference video or a story. Kinetiq then:
1. **Researches** the website: copy, features, colors, fonts, logo.
2. **Designs** a style guide (DESIGN.md) from the brand, or uses a preset or uploaded style.
3. **Directs** a script and storyboard.
4. **Animates** each scene as code: the AI writes motion graphics using our hand-tuned primitives library, so text, UI and logos are pixel-sharp.
5. **Adds audio:** optional voiceover, music and sound effects.
6. **Delivers** an MP4.

Every step is shown on a **canvas**: the pipeline as connected nodes (Website → Brand → Story → Voice → Scenes → Render). Each node shows what it made, and the user can **approve** it, **edit** it directly, or **regenerate** it with a note, before the next step spends anything. Each node can also run on **auto**, where the AI's own checks approve it. A chat panel beside the canvas answers setup questions and can send a request to the selected node ("make the intro faster").

**Why this approach wins:** we render motion graphics **from code**, not with text-to-video models. The frame-by-frame breakdown of the motion.so launch video in [`../what-i-want.md`](../what-i-want.md) shows that about 95% of a premium launch video is code-renderable motion graphics. AI video models are used only for occasional cinematic shots.

## 3. Target users

| Persona | Description | Main need |
|---|---|---|
| **Indie hacker** (primary) | Solo founder launching on Product Hunt or X | A great video today, cheaply |
| **Early-stage startup team** | 2–10 people, no in-house designer | On-brand videos for every feature launch |
| **Marketer / agency** | Makes videos for several clients | Speed, templates, brand consistency |

## 4. Goals and success metrics

| Goal | Metric | Target (first 3 months) |
|---|---|---|
| Users get great videos | % of generated videos downloaded | ≥ 60% |
| Fast delivery | Median time from URL to first video (30s video) | ≤ 5 minutes |
| Reliable | Job success rate (no failure or refund) | ≥ 97% |
| Profitable | Gross margin per video (credit revenue minus provider cost) | ≥ 70% |
| Growth | Visitor → signup → paid conversion | 2% → 5% |
| Scales | Handles a viral day | 100k visitors/month with no downtime |

**Non-goals for v1:**
- no timeline editor and no free-form node builder (editing is on the fixed canvas nodes and in chat)
- no team workspaces
- no public API for developers
- no mobile app
- no long videos (over 60s)

## 5. User flow

```
Landing page ──► chat box: URL + length + ratio + attachments ──► Send
     │                                                               │
     │ (not logged in → login with email or Google, request is kept) ▼
     │                                              Project page: CANVAS + chat panel
     │   ┌──────────────────────────────────────────────────────────────────┬────────────────┐
     │   │  [Website] ──► [Brand] ──► [Story] ──► [Voice] ──► [Scene 1] ─┐  │ Chat panel      │
     │   │   auto ✓       manual ⏸     manual      auto       [Scene 2] ─┼► │ • setup         │
     │   │                palette,     script,                [Scene 3] ─┘  │   questions     │
     │   │                fonts        storyboard                 │         │ • requests to   │
     │   │                                                        ▼         │   the selected  │
     │   │   Selected node: output ▸ Approve · Edit · Regenerate  [Render]   │   node          │
     │   │   Auto / manual toggle per node · "Auto all"          video ▶ ⬇  │                 │
     │   └──────────────────────────────────────────────────────────────────┴────────────────┘
     └──► or pick a TEMPLATE from the gallery ──► "Use this template" ──► same canvas
```

1. **Landing:** the visitor sees a gallery of example videos. **There is no free tier**, so these examples are how people judge quality before paying.
2. **Chat box:** URL (required), duration (15/30/45s), aspect ratio (16:9, 9:16, 1:1), model, attachments. A hint encourages extra assets.
3. **Login:** email magic link or Google. The draft request survives the login redirect.
4. **Setup questions** asked by the AI in chat:
   - **Voiceover?** Yes or no. If yes: one of 5 voices, a language, and whether the AI writes the script.
   - **Design style (DESIGN.md)?** Auto from website (default), upload/paste your own, or a preset.
5. **Credit estimate:** the user confirms, and credits are reserved.
6. **Canvas:** every node lights up as it runs and shows its output (the site copy and screenshot, the palette and fonts, the script and storyboard, the voice, each scene's preview frames, the video).
7. **Approvals:** a node set to *manual* stops and waits; the user approves it, edits it directly, or regenerates it with a note. By default **Brand** and **Story** are manual and the rest are auto; an "Auto all" switch runs everything straight through.
8. **Result:** the Render node plays the video.
9. **Changes later:** editing or regenerating any node after the video exists re-runs only what depends on it and creates a new version (V1, V2…) that can be restored. The chat panel can send a request to the selected node.
10. **Download** the MP4.

## 6. Features

### 6.0 MVP scope: launch small, secure from day one
The MVP ships the **core loop** only: URL → canvas (approve / edit / regenerate) → video → download → pay. **Security is never cut from the MVP.** Only features are cut.

| In the MVP | Deferred to after launch |
|---|---|
| Magic link + Google login | Templates (F13): the first template comes right after launch |
| Projects, deterministic setup questions, uploads (images + mp4) | AI cinematic clips (F14): the most expensive and riskiest feature |
| Full pipeline: research → style → script → scenes → QA (1 fix round) → render | Sarvam / Indian languages (F15) |
| Optional voiceover (ElevenLabs, 5 voices), music from a small royalty-free library, SFX library | Generated music (ElevenLabs Music) |
| Canvas with approvals, node edits + versions + download | Admin UI (the MVP uses flags through a CLI script) |
| Credit ledger + **1 subscription plan + 2 credit packs** (Dodo) | Regional pricing, more plans |
| Every security control in [SRS § 5.3](SRS.md#53-security-sec) | Nightly LLM evals (run manually before prompt changes instead) |
| Unit, integration, contract and E2E tests on fakes; CI gates | Full visual regression suite (MVP covers primitives only) |

### 6.1 Must have (v1)

| ID | Feature | Notes |
|---|---|---|
| F1 | URL → launch video | 15/30/45s, 16:9 / 9:16 / 1:1 |
| F2 | Optional inputs | Screenshots, screen recordings, reference video, logo, prompt/story |
| F3 | Auth | Email magic link/OTP + Google |
| F4 | Chat-based setup | Voiceover yes/no, voice (5 voices), language, design style |
| F5 | DESIGN.md styles | Auto from website / upload / paste / preset (generic names, no brand names) |
| F6 | Canvas | The pipeline as connected nodes, streamed live; each node shows its output. Approve, edit or regenerate with a note; auto/manual per node (default manual: Brand, Story) |
| F7 | Product UI rebuild | The AI recreates the user's UI in code; screenshots are the fallback |
| F8 | Node edits + versions | Changing a node re-runs only what depends on it; chat can target a node; restore any version |
| F9 | Audio | Optional voiceover, music, auto-placed sound effects |
| F10 | Download | MP4 |
| F11 | Payments: hybrid model | Subscriptions with monthly credits + pay-as-you-go credit packs (prices TBD) |
| F12 | Example gallery | Landing page examples (no free tier) |

### 6.2 Should have (v1.x)

| ID | Feature | Notes |
|---|---|---|
| F13 | Templates | Click a template and get a similar video with your own assets; fewer credits |
| F14 | AI cinematic clips | Kling / Seedance / Veo shots via OpenRouter; expensive, so limited by plan |
| F15 | Multi-language voiceover | Sarvam for Indian languages |

### 6.3 Later

- "Save my video as a template", community templates
- Timeline editor, team workspaces, public API
- 3D device mockups

## 7. Pricing model (hybrid; prices TBD)

- **Subscriptions** (e.g. "Go", "Pro") come with a monthly credit allowance. Marketing shows "≈ N videos / month". These credits reset monthly.
- **Pay as you go:** credit packs that don't expire, at a higher price per credit.
- **Everything is counted in credits:**
  - video by duration
  - voiceover
  - each AI clip
  - edits and regenerations after the free ones
- Credits are **estimated → reserved → settled on real cost → refunded on failure**.
- Credit prices are set to about 5× our real provider cost.

Details: [`../what-i-want.md` § Pricing model](../what-i-want.md).

## 8. Constraints

| Constraint | Impact |
|---|---|
| Solo student founder, no budget | Cheap managed services, scale-to-zero rendering, no free tier |
| Global product | Multi-language, local-currency payments (Dodo is Merchant of Record) |
| Security is top priority | No payment bypass, no API abuse, DDoS protection, sandboxed AI code |
| Legal | No Apple logo, macOS wallpapers, SF Pro font or real app icons. Presets and templates don't copy other brands. |

## 9. Risks

| Risk | Mitigation |
|---|---|
| Output quality varies | Primitives library, DESIGN.md presets, visual QA loop, templates |
| Provider costs spike during a viral day | Per-user and per-plan limits, a global kill-switch for AI clips, cost tracking per job |
| LLM-written code is malicious or broken | Validated before rendering (AST allowlist), sandboxed render, QA loop |
| Payment fraud | Credits only from verified webhooks, idempotent ledger |
| A provider goes down | Retries, fallback models, circuit breaker, friendly "queued" state |

---
← [README](README.md) · **Next →** [SRS.md: Software Requirements Specification](SRS.md)
