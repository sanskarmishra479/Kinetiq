# ARCHITECTURE: System Design

**Kinetiq** · **Status:** Draft v1 · **Last updated:** 2026-09-21

← [SRS](SRS.md) · **ARCHITECTURE** · [API →](API.md)

---

## 1. Goals that shape the design

These come from [SRS.md § 5](SRS.md#5-non-functional-requirements):

1. **Scale from 5k to 100k visitors/month by configuration, not a rewrite** (NFR-SCALE-01…04).
2. **Cheap at small scale.** Everything scales to zero or near zero (a solo founder with no budget).
3. **Video generation is the real load.** It's slow (minutes), expensive and bursty, so it lives in a **queue** and never inside HTTP requests.
4. **Security first:** no payment bypass, no API abuse, sandboxed AI-written code.
5. **Testable by design.** Every external dependency sits behind an interface and has a fake (NFR-MNT-01).

## 2. System overview

```
                     Cloudflare (DNS · WAF · DDoS · rate-limit rules · Turnstile)
                      │                          │                         │
       kinetiq.so  (Vercel)          api.kinetiq.so  (Railway)      Cloudflare R2 + CDN
       Next.js                       Express API                    • cdn.kinetiq.so: OUR public
       • static landing/gallery      • stateless, ≥2 replicas         files (example videos)
         /templates/pricing (SSG)    • REST /v1 + SSE events        • kinetiqcontent.com: USER
       • app pages (/project/...)    • BetterAuth                     uploads/renders (private,
                                                                      signed URLs, separate domain)
                                     • Dodo/render/video webhooks
                                         │            ▲
                               enqueue   │            │ pub/sub progress events
                                         ▼            │
                             Redis (Railway) — BullMQ queues · rate limits · pub/sub
                                         │
                             Worker service (Railway, N replicas)
                             • LangGraph.js pipelines (generate, edit)
                             • provider adapters · cost tracking
          ┌──────────────┬───────────────┼────────────────┬──────────────────┐
     Firecrawl      OpenRouter LLM    ElevenLabs /     OpenRouter video     Remotion Lambda (AWS)
     (scrape +      (Claude: director, Sarvam          (Kling, Seedance…)   • renderStill (QA previews)
      screenshots)   coder, QA vision) (voice, SFX,    async jobs           • renderMedia (final MP4)
                                        music)
                                         │
                   Postgres (Neon, pooled) — users · projects · jobs · versions · ledger · checkpoints
```

## 3. Components

| Component | Tech | Responsibility | Scales by |
|---|---|---|---|
| **Web** (`apps/web`) | Next.js App Router, Tailwind, shadcn/ui | Landing, gallery, templates, pricing (static); login; project page (chat + live pane); billing | Vercel CDN (automatic) |
| **API** (`apps/api`) | Express, BetterAuth, zod, Prisma | Auth, REST, SSE, webhooks, credit reservation, enqueueing jobs | More replicas (stateless) |
| **Worker** (`apps/worker`) | BullMQ, LangGraph.js | Runs pipelines, calls providers, tracks costs, sends events | More replicas and the `WORKER_CONCURRENCY` env var |
| **Renderer** (`packages/renderer`) | Remotion 4 | Dynamic scene runtime and final composition; deployed once to Lambda | Lambda concurrency (scales to zero) |
| **Primitives** (`packages/primitives`) | React + Remotion | Hand-tuned motion building blocks (Cursor, Camera, Lens…) | n/a (a library) |
| **Shared** (`packages/shared`) | TypeScript + zod | Request/response/event schemas, plan and credit tables, model registry | n/a |
| **DB** (`packages/db`) | Prisma + Postgres (Neon) | Schema, migrations, client | Neon compute size, pooled connections |
| **Redis** | Railway Redis | Queues, rate limits, pub/sub | Instance size |
| **Storage** | Cloudflare R2 (MinIO locally) | **Two domains:** `cdn.kinetiq.so` only for *our own* public files (example videos, posters); a **separate domain** `kinetiqcontent.com` for all user uploads and renders (private, signed URLs). See NFR-SEC-10 | Automatic, no egress fees |

## 4. Key flows

### 4.1 Visitor → project (landing is static)
```
Visitor on kinetiq.so (CDN, static HTML) ─ types URL, picks options ─► saved in localStorage
   └─ Send ─► not logged in? ─► /login (BetterAuth) ─► back to /new ─► reads the draft
       ─► POST /v1/projects ─► redirect to /project/:id
```
Anonymous visitors **never touch the API**, so a viral spike on the landing page costs nothing at the origin (NFR-SCALE-01).

### 4.2 Generation (the main flow)
```
Browser                API                         Redis/BullMQ        Worker                 Providers
  │ POST /estimate ───►│ price table → credits      │                   │                       │
  │◄── {credits} ──────│                            │                   │                       │
  │ POST /generate ───►│ SERIALIZABLE tx:           │                   │                       │
  │  (Idempotency-Key) │  reserve credits, Job row  │                   │                       │
  │                    │ enqueue generate ─────────►│──────────────────►│ LangGraph run         │
  │◄── 202 {jobId} ────│                            │                   │ research ────────────►│ Firecrawl
  │ GET /events (SSE) ►│ subscribe project channel ◄│◄── publish step ──│ designMd/director ───►│ OpenRouter
  │◄── step events ────│                            │                   │ sceneCoder ×N ───────►│ OpenRouter
  │                    │                            │                   │ validate (AST)        │
  │                    │                            │                   │ previewStills ───────►│ Lambda
  │                    │                            │                   │ visualQA ⟲ fix ──────►│ OpenRouter (vision)
  │                    │                            │                   │ audio ───────────────►│ ElevenLabs
  │                    │                            │                   │ finalRender ─────────►│ Lambda → R2
  │                    │ settle credits ◄───────────│◄──────────────────│ done
  │◄── video.ready ────│                            │                   │
```

### 4.3 Chat edit
1. The user message goes to `POST /messages`.
2. The API creates an `edit` job.
3. The worker's **edit graph** classifies the request (`script`, `scene:N`, `style`, `voice`, `music`, `format`).
4. Only the affected nodes and scenes re-run. Unchanged scene code is copied as-is.
5. A final re-render creates **Version N+1** (FR-EDIT-02, FR-EDIT-03).

### 4.4 Payment
```
POST /billing/checkout ─► Dodo checkout URL ─► user pays on Dodo
Dodo ─► POST /webhooks/dodo ─► verify signature (raw body) ─► dedupe by event id
    ─► payment.succeeded           → grant a purchase bucket (never expires)
    ─► subscription.active/renewed → grant a subscription bucket (expires at period end)
    ─► subscription.cancelled      → stop future grants
```
The success redirect page **grants nothing**. It only shows the balance (FR-CRD-01).

## 5. Generation pipeline (LangGraph.js)

```
research ─► designMd ─► director ─► [voiceover] ─► sceneCoder(1..N, parallel)
   ─► validate ─► previewStills ─► visualQA ──(issues, round<2)──► sceneFix ─┐
                                      │ ok                                   │
                                      ▼                          ◄───────────┘
                               [aiClips] ─► audio(music+SFX+VO mix) ─► finalRender ─► settle ─► notify
```

| Node | Input | Output | Provider |
|---|---|---|---|
| research | URL, uploaded assets | page copy, features, screenshots, brand colors/fonts/logo | Firecrawl |
| designMd | research, user choice | DESIGN.md + theme tokens (validated with zod) | OpenRouter (Claude) |
| director | research, DESIGN.md, duration, template? | script, scene list with timings (structured output) | OpenRouter (Claude) |
| voiceover | script, voice | audio + word timestamps → final scene lengths | ElevenLabs / Sarvam |
| sceneCoder | scene brief, DESIGN.md, primitives API docs (cached prompt) | scene TSX | OpenRouter (Claude) |
| validate | TSX | pass or reject (AST allowlist) plus transpiled JS | local |
| previewStills | JS, keyframes | PNG stills | Remotion (renderStill) |
| visualQA | stills | issues list (overflow, cut-off text, contrast, empty frames) | OpenRouter (vision) |
| aiClips | shot prompts | MP4 clips (async submit, then callback or poll) | OpenRouter video |
| audio | VO, music choice, cut list | mixed audio track, SFX cue list | ElevenLabs |
| finalRender | scenes + audio + captions + Lens | MP4 in R2 | Remotion (renderMedia) |
| settle | ProviderCost rows | ledger settle/refund | local |

- **Checkpointing:** a LangGraph Postgres checkpointer saves state after each node. Retries resume from the last successful node (FR-GEN-05).
- **Templates:** `director` is replaced by `fillTemplate`, which maps research to the template's slots. `sceneCoder` only generates slot content, such as the rebuilt UI (FR-TPL-02).
- **Events:** each node publishes `step.started|progress|done|failed` to Redis channel `project:{id}`. The API forwards them over SSE ([API.md § 8](API.md#8-realtime-events-sse)).

## 6. Dynamic scene runtime (sandbox)

**Problem:** the LLM writes new animation code for every job. Bundling and deploying a Remotion site per job would be slow and expensive, and running untrusted code is dangerous.

**Solution:** deploy **one** Remotion site (`packages/renderer`, which includes the primitives). Scene code arrives as data:

```
LLM TSX ─► validator (AST allowlist) ─► transpile (sucrase/esbuild) ─► JS string
        ─► inputProps.scenes[i].code ─► renderer evaluates it with a WHITELISTED scope
           { React, remotion APIs, @kinetiq/primitives, theme } ─► <Scene/>
```

**The validator rejects:**
- any import other than `react`, `remotion` or `@kinetiq/primitives`
- `import()`, `require`, `eval`, `Function`
- `fetch`, `XMLHttpRequest`, `WebSocket`
- `window`, `document`, `globalThis`, `self`
- timers, `localStorage`
- code over 30 KB
- the escape tricks `constructor`, `__proto__`, `prototype`; computed access with a non-literal key (`obj[x]`); tagged templates (NFR-SEC-13)

**Where the code runs:**
- **Production:** only inside the Lambda render sandbox. The API and worker **never** evaluate scene code, because they hold secrets (NFR-SEC-12).
- **Local development:** it renders on your machine, after the same validation.

**Render page CSP:** `default-src 'none'`; scripts only from the deployed bundle; images, media and fonts only from our content domain and font origin. Even code that slips past the validator can't send data anywhere.

**Defense in depth:**
- The render Lambda has **no secrets**, an IAM role that can only write to the renders bucket, and a hard timeout.
- Code runs inside Chrome's sandbox.

This implements FR-GEN-06 and NFR-SEC-06.

## 7. Data model (Prisma)

```
User 1─* Session / Account                     (BetterAuth)
User 1─* Project 1─* Message
                 1─* Asset
                 1─* Job 1─* JobStep
                 1─* Version 1─* Scene
                 *─1 BrandKit? · *─1 Template?
User 1─* CreditBucket          (source: subscription|purchase, remaining, expiresAt?)
User 1─* CreditLedger          (type: grant|reserve|settle|refund|expire, amount, bucketId, jobId?, idempotencyKey UNIQUE)
User 1─* Subscription          (dodoId UNIQUE, planCode, status, currentPeriodEnd)
User 1─* Payment               (dodoPaymentId UNIQUE)
WebhookEvent                   (provider + eventId UNIQUE, processedAt)
Template 1─* TemplateSlot      (key, type: text|image|ui|color|logo, maxChars?)
Plan / CreditPack              (code, price, credits, concurrency, flags)
ProviderCost                   (jobId, provider, units, usd)
FeatureFlag                    (key, value)   ← kill-switches (FR-ADM-01)
```

**Rules:**
- Money is stored as integer credits and cents, never floats.
- The ledger is append-only, so the balance equals `SUM(ledger)` (FR-CRD-07).
- Every user-owned table carries `userId`. Repository functions require it (NFR-SEC-08).

## 8. Testable code architecture (ports and adapters)

To keep the code from breaking, **business logic never imports an SDK directly**. It depends on **ports** (TypeScript interfaces). Real **adapters** implement them in production; **fakes** implement them in tests and in `MOCK_PROVIDERS` mode.

```
            ┌──────────────── domain (pure, 100% unit-testable) ────────────────┐
            │ credits/ (estimate, reserve plan, settle, bucket order)           │
            │ pipeline/ (graph nodes as functions of (state, ports))            │
            │ validator/ (AST allowlist)   templates/ (slot filling, fit text)  │
            └───────────────▲──────────────────────────────▲────────────────────┘
                            │ ports (interfaces)           │
  LlmPort · ScraperPort · VoicePort · VideoGenPort · RenderPort · StoragePort
  PaymentsPort · QueuePort · EventBusPort · ClockPort · IdPort · Repo ports
                            │                              │
          real adapters (prod)                    fakes (tests / MOCK_PROVIDERS)
  OpenRouterLlm, FirecrawlScraper,          FakeLlm (scripted replies), FakeScraper
  ElevenLabsVoice, LambdaRender,            (fixture sites), FakeVoice, LocalRender,
  R2Storage, DodoPayments, BullQueue …      MemoryStorage, FakePayments, FixedClock …
```

- **Composition root:** each app builds its dependencies in one file (`apps/*/src/container.ts`) from environment variables. Tests build the same container with fakes.
- **No hidden globals:** time comes from `ClockPort`, ids from `IdPort`, and randomness is seeded. Tests are deterministic.
- **Schemas are contracts:** every API body, event and queue payload is a zod schema in `packages/shared`, used by producer and consumer alike. If a contract changes, compilation breaks on both sides.

Details on how we test all of this: [TEST_PLAN.md](TEST_PLAN.md).

## 9. Scalability

| Layer | Launch (5k/mo) | Viral (100k/mo) | How it scales |
|---|---|---|---|
| Landing / gallery | Static on the CDN | Same | Nothing to do; example videos come from R2 (no egress fees) |
| API | 2 small replicas | 3–4 replicas | Stateless; Railway replicas |
| Worker | 1 replica × concurrency 20 | 3 replicas × 20 | Add replicas when queue wait p95 > 60 s |
| Rendering | Lambda, pay per render | Same; raise AWS concurrency quota before launch | Scales to zero |
| Postgres | Neon small | Neon larger compute | Pooled connections, `connection_limit` per replica |
| Redis | Small | Medium | Instance size |

**Backpressure and cost guards:**
- Per-plan concurrent jobs (e.g. Go 1, Pro 3) and a per-user daily cap.
- A global queue cap; the UI shows "Queued, position N".
- A per-provider BullMQ rate limiter, sized to each provider's limits.
- A circuit breaker marks a failing provider "degraded". Jobs then wait and retry or use the fallback model.
- Kill-switch flags pause AI clips or new jobs, triggered by a spend threshold (NFR-COST-03).
- **Job deadline:** 20 min per job, plus BullMQ stalled-job detection. Overdue jobs fail and refund (FR-GEN-11).
- **Lambda limits:** tune `framesPerLambda` so one render uses a bounded number of functions, and raise the AWS concurrency quota early (NFR-SCALE-05).
- **Redis:** `noeviction` policy, and a TTL on every non-queue key (NFR-SCALE-06).
- **Lean checkpoints:** big artifacts go to R2, checkpoints store references, and they're pruned when the job finishes (NFR-SCALE-07).

**Efficiency (cost per video):**
- Research is cached per URL for 24 h (FR-GEN-12).
- Setup questions use no LLM calls (FR-GEN-13).
- QA uses 540p stills, not full renders (NFR-COST-04).
- The primitives docs and DESIGN.md get prompt caching.
- Unchanged scenes are reused on edits.

**Performance:**
- Public catalog endpoints (`/templates`, `/voices`, `/plans`) are cached at the CDN.
- Gallery videos use `preload="none"` with poster images.
- The LLM system prompts (primitives docs, DESIGN.md) use **prompt caching**.

## 10. Security architecture

| Threat | Control |
|---|---|
| Payment bypass | Credits only from verified and deduplicated Dodo webhooks; the success page grants nothing |
| API abuse / cost attacks | Auth on every expensive endpoint; zod validation; credit reservation before any provider call; rate limits (Cloudflare + Redis); per-plan concurrency |
| DDoS | Cloudflare in front of everything; static landing; Turnstile on signup |
| Secrets leak | Keys only in API and worker environments; the browser never calls providers; the render Lambda has none |
| IDOR (reading another user's data) | Repositories require `userId`; returns 404 for other users' resources |
| SSRF | User URLs are fetched only by Firecrawl |
| Malicious AI code | AST allowlist, whitelisted scope, sandboxed Lambda (§ 6) |
| Prompt injection | Scraped content treated as delimited data; structured, validated outputs |
| Upload abuse | Presigned POST with size, MIME and prefix conditions; the server generates the key; server-side magic-byte check on complete; `ffprobe` on videos; SVG and HTML never accepted |
| Same-site attacks through user content | User files served from a separate registrable domain with `nosniff` and `attachment` (NFR-SEC-10) |
| Cross-site request forgery on the API | `Origin` header check on every state-changing request, plus SameSite cookies (NFR-SEC-11) |
| Account takeover / email bombing | Per-email + per-IP magic-link limits, no user enumeration, 2FA for admins, verified-email-only account linking (FR-AUTH-06, 07) |
| Runaway provider bills | Hard spend caps on every provider key, plus our own kill-switches (NFR-SEC-14) |
| Secrets in logs | Log redaction (NFR-SEC-15) |
| Supply chain | Lockfile, Renovate, Actions pinned by SHA, `pnpm audit`, gitleaks (NFR-SEC-17) |
| Refund or chargeback abuse | Claw back credits; a negative balance blocks new jobs (FR-CRD-09) |
| CSRF / XSS | SameSite cookies, BetterAuth CSRF, strict CSP (helmet), React escaping |

## 11. Repository layout

```
Cinelaunch/
├─ apps/
│  ├─ web/            Next.js (landing, login, project page, billing)
│  ├─ api/            Express (routes, auth, SSE, webhooks) + src/container.ts
│  └─ worker/         BullMQ processors, LangGraph graphs, adapters + src/container.ts
├─ packages/
│  ├─ shared/         zod schemas (API, events, queues), plans, credit table, model registry
│  ├─ domain/         pure business logic: credits, pipeline nodes, validator, templates
│  ├─ db/             Prisma schema, migrations, repositories
│  ├─ primitives/     motion primitives (moved from /primitives)
│  └─ renderer/       Remotion root: dynamic scene runtime + final composition
├─ infra/             docker-compose.yml, k6 load tests, Lambda deploy scripts
├─ docs/              ← you are here
├─ .env.example       every variable documented
└─ .github/workflows  CI (see TEST_PLAN § 5)
```

## 12. Environments

| Environment | Web | API / Worker | DB | Providers | Render |
|---|---|---|---|---|---|
| **local** | `next dev` | `tsx watch` | Docker Postgres | `MOCK_PROVIDERS=true` (fakes) | `RENDER_MODE=local` |
| **CI** | build only | tests | Testcontainers Postgres + Redis | fakes + MSW | local stills (visual tests) |
| **staging** | Vercel preview | Railway staging | Neon branch | real, with low limits | Lambda (staging) |
| **production** | Vercel | Railway | Neon main | real | Lambda |

## 13. Observability

- **Errors:** Sentry in web, API and worker, with the release tagged by git SHA.
- **AI traces:** LangSmith, one trace per job linked by `jobId`.
- **Logs:** structured JSON with `requestId`, `userId` and `jobId`, shipped to the log provider.
- **Metrics and alerts:**
  - queue depth and wait p95
  - job success rate
  - cost per video and daily spend
  - 5xx rate
  - webhook failures
- **Product analytics:** PostHog for funnels (visit → signup → paid).

## 14. Architecture decisions (ADR summary)

| # | Decision | Why |
|---|---|---|
| 1 | Code-rendered motion graphics (Remotion), not text-to-video | Pixel-sharp UI and text; cheap; editable per scene |
| 2 | One deployed renderer + dynamic scene code | No per-job bundling; sandboxed |
| 3 | Queue (BullMQ) for all slow work | Survives spikes; retries; backpressure |
| 4 | Remotion Lambda for rendering | Scales to zero; parallel chunks; pay per use |
| 5 | Static landing, draft saved in the browser | Viral traffic never hits the origin |
| 6 | Credit ledger with buckets | Fair hybrid pricing; auditable; no negative margins |
| 7 | Ports and adapters with fakes | Testable, swappable providers, zero-cost local development |
| 8 | Cloudflare R2 | No egress fees for video-heavy traffic |

---
← [SRS](SRS.md) · **Next →** [API.md: API Reference](API.md)
