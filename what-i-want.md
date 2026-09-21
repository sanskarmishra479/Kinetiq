> 📚 **Full docs:** see [`docs/`](docs/README.md). Read them in order: README → PRD → SRS → ARCHITECTURE → API → TEST_PLAN. This file is the founder's vision and decision log.

# One-line explanation
**Motto: "URL to video."**

**Kinetiq** (kinetiq.so) is a micro-SaaS that turns a startup's URL into a **motion-designer-quality launch video**.

```
URL  (+ optional: screenshots, screen recordings, reference videos, logo, prompt/story)  ───►  launch video
```

The output is **not** a slideshow of screenshots with text on top. It should look like the work of a real motion designer: recreated product UI, camera moves, an animated cursor, kinetic typography, custom illustrated animations, beat-matched music, sound effects and (optionally) a voiceover. Reference products: motion.so, Runway.

---

# User flow

1. **Landing page:** the user comes to the Kinetiq landing page. It explains what we do and shows a **gallery of example videos** (different styles, ratios and durations). **There are no free credits**, so these examples are how people judge quality before paying. Each example shows the input it was made from (URL + options), so visitors can see what they'd get.
2. **Chat box on the landing page:** the user fills in:
   - **URL** (required)
   - **Duration:** 15s / 30s / 45s
   - **Aspect ratio:** 1:1 / 9:16 / 16:9
   - **Model** (the AI video model used for cinematic shots, e.g. Kling or Seedance)
   - **Attachments** (optional): screenshots, screen recordings, reference videos, logo, extra prompt or story

   Then they press Enter or the send button.
   > 💡 The UI tells the user: *"A URL is all we need, but the more you give us (screenshots, a screen recording, a reference video, your story), the better your video gets."* We show this as a hint under the chat box and again in the first AI message if they only gave a URL.
3. **Login:** if the user isn't logged in, show the login page (email + Google). After login they go straight to the new project page with their request kept.
4. **The AI asks setup questions** in the chat before generating:
   - **Voiceover?** Yes / no (it's optional). If yes:
     - **Voice:** pick from a list, e.g. *Sam (confident, fast, male)*, *Kira (confident, female)*… each with a short preview clip
     - **Language**
     - **Script:** the AI writes it, or the user provides it
   - **Design style (DESIGN.md)?** One of:
     - **Auto from my website** (default): we build a style guide from the URL's colors, fonts and logo
     - **Upload / paste my own DESIGN.md**
     - **Pick a preset style:** e.g. "Minimal premium", "Dark cinematic", "Bold kinetic", "Warm editorial", "Playful illustrated"
       *(we don't name presets after real brands, to avoid trademark issues)*
5. **Project page (two panes, like Lovable, see `image.png`):**
   - **Left:** chat with the AI
   - **Right:** a live view of what the AI is doing. Research → style guide → script → storyboard → "Designing scene 2/5" with thumbnails as they finish → audio → final render
6. **Result:** the finished video shows up automatically in the right pane.
7. **Edits by chat only:** the user asks for changes in chat ("make the headline bigger", "slower intro", "swap scene 3", "change the music", "use Kira's voice"). **Only the affected scenes or audio are re-rendered**, not the whole video. Each change creates a new version (V1, V2…), and the user can go back to any version.
8. **Download** the video (MP4).

---

# Reference breakdown: the motion.so launch video (76s, 4K, 30fps)

What we saw, frame by frame:

| Time | What's on screen | How it's made |
|---|---|---|
| 0–6s | macOS desktop, an X post, a "Mom" chat window, a notification ("Launch is in 5 mins! Where is the video?!"), camera pushing into the UI | Recreated vector UI plus camera moves. **Not screenshots, not AI video** |
| 6–24s | The Motion product UI: typing the prompt, aspect/duration dropdowns, DESIGN.md preset picker, "Designing scene 1/3", "V1", Export | Recreated product UI with an animated cursor, zooms and focus pulls |
| 26–32s | iMessage chat: "Made it with Motion", "you think so?" | Kinetic UI: bubbles pop in with a spring bounce and motion blur |
| 34–40s | "LAUNCH / VIDEO / TOOL" stacked type, "Everything", typewriter "design agent" | Kinetic typography |
| 42–44s | Man talking to camera, watch poster "DEEP WATCHES" | The only part that looks like AI video or stock footage |
| 48–62s | OpenAI node diagram, HUD rings, blueprint landing gear, rocket altimeter, cartoon character, card pyramid | Custom illustrated animations, **each in a completely different style** |
| 64–70s | Prompt box, "Plan on" button click, like/dislike/share icons | UI elements with cursor interaction |
| 72–76s | Logo morph, then "motion.so" end card | Logo reveal |
| Throughout | Word-by-word captions at the bottom | Synced to the voiceover or audio |

## What we learned
1. **About 95% is code-rendered motion graphics, not AI video.** UI, text and logos are pixel-sharp. Kling, Seedance and similar models can't render exact UI, text or logos because they hallucinate them.
2. **The variety is too wide for fixed templates.** HUD, blueprint, cartoon and iMessage styles in one video mean **an LLM writes custom animation code for each scene**.
3. **DESIGN.md drives the look.** A markdown style guide (colors, fonts, spacing, motion rules) is what makes the output feel designed rather than random.
4. **Scene by scene:** each scene is its own piece of code, so an edit only re-renders one scene. That makes edits fast and cheap.
5. **AI video is a supporting ingredient** (a cinematic shot here and there), not the core.

---

# How Kinetiq generates a video (pipeline)

```
1. Research       URL → scrape content, screenshots, CSS (colors, fonts, logo)
                  + user uploads (screenshots, recordings, reference video, story)
2. Style          DESIGN.md → auto-generated from the site / uploaded / preset
3. Director       LLM writes the story, script, captions, scene list + timings
4. Voiceover      (optional) ElevenLabs / Sarvam with the chosen voice
                  → word timestamps set the exact scene lengths
5. Scene Coder    LLM writes animation code per scene (runs in parallel), using
                  DESIGN.md + our primitives library
6. Render         each scene rendered in an isolated sandbox (Remotion / headless Chrome)
7. Visual QA      grab keyframes → vision model checks for overflow, cut-off text,
                  bad contrast, empty frames → fixes the code → re-render (max N tries)
8. AI video       only where a cinematic shot helps (Kling / Seedance / Veo via OpenRouter)
9. Audio          music (beat-matched, cuts land on beats) + SFX auto-placed on
                  every cut / pop / click / whoosh + voiceover + captions
10. Final         stitch scenes + mix audio → MP4 → storage → shown in the right pane
```

### Product UI: rebuild first, screenshots as a fallback
- **Default:** the LLM **rebuilds the user's product UI** as HTML/SVG from their screenshots and website, so it stays crisp, animatable and on-brand.
- **Fallback:** if rebuilding fails QA (or the UI is too complex), animate the real screenshot instead (device frame, pan/zoom, cursor, highlights).
- A user-supplied screen recording can be used directly inside a device frame.

### Primitives library (our moat)
Reusable building blocks the Scene Coder calls, so it doesn't reinvent the basics each time:
- camera (push-in, pan, focus pull, motion blur)
- animated cursor (move, click ripple, hover)
- device frames (browser, macOS window, phone)
- text effects (kinetic stack, typewriter, word-by-word captions, mask reveal)
- chat bubbles, notifications, buttons, dropdowns
- logo reveal / end card
- spring and easing presets, transitions

**Quality comes from:** this library, the DESIGN.md presets and the QA loop. Anyone can call the AI models, so those aren't the moat.

---

# Technical notes
1. **Multi-model:** AI video through OpenRouter (Kling, Seedance, Veo, Wan, Hailuo…). The OpenRouter video API is **async**: submit a job, then poll or get a webhook callback, then download. The model registry lives in our code (supported durations, ratios, credit cost).
2. **Payments: hybrid model (subscription + credits).** See the Pricing model section below.
   - **No free credits / no free tier.** Users must subscribe or buy credits before generating. (So there's no watermark tier either.)
3. **Audio:**
   - Voiceover is **optional**, and the AI asks the user if they want one.
   - **Voice picker: 5 voices at launch.** Our own named voices (e.g. *Sam: confident, fast, male*; *Kira: confident, female*) that map to ElevenLabs / Sarvam voice IDs behind the scenes. Each has a preview clip.
   - Music through ElevenLabs Music or a licensed library. SFX from our own library plus ElevenLabs SFX.
4. **Inputs:** a URL is required. Optional: screenshots, images, logo, screen recordings, reference videos, prompt/story. **The more the user gives, the better the video**, and the UI says so.
5. **Global product:** multi-language voiceover and captions (Sarvam for Indian languages), a global CDN, and payments in local currencies (Dodo acts as Merchant of Record and handles tax).
6. **Editing is chat only:** there's no timeline editor and no code view for users.

---

# Pricing model (hybrid) — prices TBD

Two ways to pay, and **everything is metered in credits underneath**:

1. **Subscription plans** (e.g. "Go", "Pro"): a fixed monthly price that gives a monthly credit allowance.
   - Marketing shows an approximate number of videos (e.g. "≈5 launch videos / month") so it stays simple for users.
   - Subscription credits **reset every month** and don't roll over.
2. **Custom / pay as you go:** buy credit packs with no subscription.
   - Purchased credits **don't expire**.
   - The price per credit is higher than subscriptions, which nudges people toward subscribing.

### Why count credits, not videos
Videos cost us very different amounts: duration, voiceover, AI cinematic clips and the number of edits all change the cost. If we counted whole videos, one heavy user (45s + AI clips + many edits) could cost more than they pay. Credits make every user profitable.

### Credit rules
- Every action has a credit cost: video by duration (15s / 30s / 45s), voiceover, each AI cinematic clip, and chat edits.
- **Before generating:** show the estimated credit cost. **When the job starts:** reserve the credits. **When it finishes:** settle on the real cost. **If it fails:** refund automatically.
- A few free edits per video (e.g. the first 3), then edits cost credits.
- Expensive features (AI cinematic clips, longer videos) can be limited to higher plans or cost extra credits.
- Credit prices are set to roughly **5× our real cost**, to cover retries, failed renders and payment fees.
- Subscriptions and credit packs both go through **Dodo Payments**. Credits are only granted by the verified Dodo webhook (see Security).

### To decide later
- Plan names, prices and monthly credits per plan
- Credit pack sizes and prices
- The credit cost of each action (measure real costs from the first ~50 videos first)
- Regional pricing for a global audience (e.g. India)

---

# Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + Tailwind + shadcn/ui | As planned |
| Backend API | Node.js + Express | As planned. REST plus SSE for the live progress pane |
| Job queue | **Redis + BullMQ** | Video jobs take minutes, so they can't run inside HTTP requests |
| Workers | Node worker(s) | Run the AI pipeline, rendering and FFmpeg |
| AI orchestration | **LangGraph.js** + **LangSmith** (tracing) | Multi-step graph with retries, checkpoints and partial re-runs for edits. Langflow isn't needed |
| LLM | Claude via OpenRouter | Strong at writing code (scene animation) and vision (QA). One key for all models |
| Video render | **Remotion** (React → video) or headless Chrome frame capture | Renders the LLM-written scenes. Remotion needs a company license once the team is over 3 people |
| Final assembly | FFmpeg | Stitching and audio mixing |
| Voice / music / SFX | ElevenLabs (+ Sarvam for Indian languages) | As planned |
| URL scraping | Firecrawl (or Playwright) | Content, screenshots, branding |
| Auth | BetterAuth (email + Google) | As planned |
| DB / ORM | Postgres (Neon) + Prisma | As planned |
| File storage | Cloudflare R2 (MinIO for local dev) | Cheap, no egress fees, signed URLs |
| Payments | Dodo Payments | As planned |
| Edge / security | Cloudflare (WAF, rate limiting, Turnstile) | DDoS and bot protection |
| Local dev | Docker Compose (Postgres, Redis, MinIO) | As planned |

Docs: [OpenRouter video](https://openrouter.ai/docs/guides/overview/multimodal/video-generation) · [ElevenLabs TTS](https://elevenlabs.io/docs/overview/capabilities/text-to-speech) · [Dodo Payments](https://docs.dodopayments.com/introduction)

Env files: `.env.example` (documented, committed) and `.env` (real keys, **never committed**).

---

# Security (the main priority)
- **No payment bypass:** credits are granted **only** by the verified Dodo webhook (signature checked, events deduplicated, amount matched to the server-side price list). The client "success" page grants nothing. The balance is checked and reserved in a DB transaction before any AI call.
- **No direct API abuse:** all AI and provider keys stay on the server or worker only. The browser never calls OpenRouter or ElevenLabs. Every endpoint requires auth, validates input (zod) and checks credits.
- **DDoS / spam:** Cloudflare in front, rate limits per IP and per user (Redis), a Turnstile captcha on signup and anonymous submits, limits on concurrent jobs per user, and size/type limits on uploads.
- **Sandbox for LLM-written code:** scene code is untrusted. It renders in an isolated container with **no network, no secrets, CPU/memory/time limits**, and only whitelisted imports (our primitives).
- **SSRF:** user URLs are scraped through Firecrawl, never fetched from our own servers. If we ever fetch directly, block private/internal IPs.
- **Prompt injection:** scraped website text is treated as data only, and LLM output is forced into a validated structure.
- **Inspect / tamper:** httpOnly secure cookies, CSRF protection, strict CORS and CSP, every DB query scoped to the logged-in user (users can't open other people's projects), and private storage with short-lived signed download links.

---

# Open questions
1. Pricing: plan names/prices, credit packs and per-action credit costs (discuss later)
2. Which voiceover languages at launch? (voices decided: 5)
3. Which style presets to launch with (3–5)?

# Decided
- Name: **Kinetiq**, domain **kinetiq.so** (check it's free on a registrar before buying).
- No free credits and no free tier. The landing page shows example videos instead.
- Payments: **hybrid model**, subscription plans with monthly credits + pay-as-you-go credit packs, all metered in credits.
- 5 voices at launch.
- The primitives library and DESIGN.md presets are built in-house (me + Claude), not by a hired designer.
- Product UI is recreated in code; macOS/device visuals avoid Apple trademarks (logo, wallpapers, SF Pro font, real app icons).
