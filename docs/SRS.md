# SRS: Software Requirements Specification

**Kinetiq** · **Status:** Draft v1 · **Last updated:** 2026-09-21

← [PRD](PRD.md) · **SRS** · [ARCHITECTURE →](ARCHITECTURE.md)

---

## 1. Purpose and scope

This document turns the product features in [PRD.md](PRD.md) into **exact, numbered, testable requirements**.

- Every requirement has an ID (e.g. `FR-CRD-03`).
- [TEST_PLAN.md § 7 Traceability matrix](TEST_PLAN.md#7-traceability-matrix) lists the tests that prove each one.
- [ARCHITECTURE.md](ARCHITECTURE.md) and [API.md](API.md) describe *how* each requirement is implemented.

**Wording:** **MUST** = required for v1. **SHOULD** = expected unless there's a documented reason not to. **MAY** = optional.

## 2. Definitions

| Term | Meaning |
|---|---|
| **Project** | One launch-video effort for one URL. Contains chat, jobs and versions. |
| **Job** | One background run: a full generation or an edit. |
| **Step** | One pipeline node inside a job, e.g. `research` or `sceneCoder`. |
| **Version** | One rendered video (V1, V2…). Every edit creates a new version. |
| **Scene** | One piece of LLM-written animation code inside a version. |
| **Primitive** | A hand-built animation component (Cursor, Camera, Lens…) that scene code uses. |
| **DESIGN.md** | A markdown style guide (colors, fonts, motion rules) that drives the look. |
| **Credit** | The unit of payment. Every billable action costs credits. |
| **Bucket** | A group of credits with one source (subscription or purchase) and an expiry date. |
| **Reservation** | Credits held for a running job. They're later settled (charged) or refunded. |
| **Template** | A pre-built video structure with slots the AI fills using the user's assets. |

## 3. Actors

| Actor | Description |
|---|---|
| Visitor | Not logged in. Sees the landing page, gallery, templates and pricing. |
| User | Logged in, with or without credits. |
| Subscriber | A user with an active subscription. |
| Admin | The founder. Manages templates, presets and kill-switches. |
| Dodo Payments | External system that sends payment and subscription webhooks. |
| AI providers | OpenRouter (LLM + video, and voice), ElevenLabs/Sarvam (voice), Firecrawl (scraping). Which voice provider and which model each AI role uses are chosen in the environment, not in code (NFR-MNT-05). |
| Renderer | Remotion (local or AWS Lambda). |

## 4. Functional requirements

### 4.1 Authentication (AUTH)
| ID | Requirement |
|---|---|
| FR-AUTH-01 | Users MUST be able to sign up and log in with an email magic link/OTP or Google. |
| FR-AUTH-02 | Sessions MUST use httpOnly, Secure, SameSite=Lax cookies scoped to `.kinetiq.so`. |
| FR-AUTH-03 | Signup MUST be protected by Cloudflare Turnstile. |
| FR-AUTH-04 | A draft request made on the landing page while logged out MUST survive the login redirect and open as a new project. |
| FR-AUTH-05 | Users MUST be able to log out, which invalidates the session on the server. |
| FR-AUTH-06 | Magic-link requests MUST be rate-limited **per email address** (e.g. 3/hour) as well as per IP. The response MUST be identical whether or not the email exists (no user enumeration). |
| FR-AUTH-07 | Admin accounts MUST use two-factor authentication. Google and email accounts are only linked when the email is verified. |

### 4.2 Projects and inputs (PRJ)
| ID | Requirement |
|---|---|
| FR-PRJ-01 | A user MUST be able to create a project with: URL (required, https only), duration ∈ {15, 30, 45}, ratio ∈ {16:9, 9:16, 1:1}, and optionally model (from the allow-list; AI clips are post-MVP), templateId and assetIds. |
| FR-PRJ-02 | Invalid input MUST be rejected with `400` and field-level errors. |
| FR-PRJ-03 | Users MUST be able to list (paginated), open and delete only **their own** projects. Other users' projects MUST return `404`. |
| FR-PRJ-04 | Users MAY attach up to 10 assets per project. Allowed types: images (png/jpg/webp ≤ 10 MB) and videos (mp4/webm ≤ 100 MB, ≤ 2 min). Videos MUST be probed with `ffprobe` by the worker before use. **SVG, HTML, PDF and any other type MUST be rejected.** |
| FR-PRJ-05 | Uploads MUST go directly to storage through presigned URLs. The server MUST verify the size and MIME type before an asset is usable. |
| FR-PRJ-06 | The UI MUST show the hint "the more you give us, the better your video" under the chat box, and again in the first AI message when only a URL was given. |

### 4.3 Chat and setup (CHAT)
| ID | Requirement |
|---|---|
| FR-CHAT-01 | Before the first generation, the AI MUST ask about voiceover (yes/no). If yes, it MUST ask for a voice (one of 5), a language, and who writes the script. |
| FR-CHAT-02 | The AI MUST ask for the design style: auto from website (default), upload/paste DESIGN.md, or a preset. |
| FR-CHAT-03 | Chat history MUST be saved and shown again when the project is reopened. |
| FR-CHAT-04 | Sending a message MUST be idempotent: resending with the same `Idempotency-Key` must not create a duplicate. |

### 4.4 Generation pipeline (GEN)
| ID | Requirement |
|---|---|
| FR-GEN-01 | The system MUST show a credit estimate before generating, and generate only after the user confirms. |
| FR-GEN-02 | Generation MUST run as a background job. The HTTP request MUST return within 500 ms with a job id. |
| FR-GEN-03 | The pipeline MUST run these steps in order: research → designMd → director → [voiceover] → sceneCoder (one per scene, in parallel) → validate → previewStills → visualQA (fix loop, at most 2 rounds) → [aiClips] → audio → finalRender → settle. |
| FR-GEN-04 | Every step MUST emit progress events (started, progress, done, failed) with optional thumbnails. The project page shows these live. |
| FR-GEN-05 | If a step fails, it MUST be retried (at most 3 times with backoff) from its checkpoint, without re-running or re-paying for finished steps. |
| FR-GEN-06 | Scene code MUST pass the AST allowlist validator ([ARCHITECTURE § 6](ARCHITECTURE.md#6-dynamic-scene-runtime-sandbox)) before any render. Rejected code MUST be regenerated or the job MUST fail safely. |
| FR-GEN-07 | By default the product UI MUST be rebuilt as code from screenshots and the website. If QA fails twice, the system MUST fall back to animating the real screenshots. |
| FR-GEN-08 | The final output MUST be an H.264 MP4 at 1080p (the short side is 1080 for 9:16 and 1:1), 30 fps, at the requested duration ±0.5 s. |
| FR-GEN-09 | Users MUST be able to cancel a running job. Unused reserved credits MUST be refunded. |
| FR-GEN-10 | Each user MUST have a concurrent job limit set by their plan. Extra jobs MUST be queued, and the UI shows their queue position. |
| FR-GEN-11 | Every job MUST have a hard deadline (default 20 min). Stalled or overdue jobs MUST be failed and refunded automatically. |
| FR-GEN-12 | Research results (scraped content, screenshots, brand) SHOULD be cached per normalized URL for 24 h to avoid paying twice. |
| FR-GEN-13 | The setup questions MUST be a deterministic state machine that makes **no LLM calls**. |

### 4.5 Edits and versions (EDIT)
| ID | Requirement |
|---|---|
| FR-EDIT-01 | Users MUST be able to request changes in chat after a video is generated. |
| FR-EDIT-02 | An edit MUST re-run only the affected steps and scenes. Unchanged scenes' code MUST be reused. |
| FR-EDIT-03 | Every successful generation or edit MUST create a new immutable version. |
| FR-EDIT-04 | Users MUST be able to restore any earlier version. Restoring creates a new version that copies the old one. |
| FR-EDIT-05 | The first 3 edits per video MUST be free. Later edits cost credits. |

### 4.6 Audio (AUD)
| ID | Requirement |
|---|---|
| FR-AUD-01 | Voiceover is optional. When enabled, it MUST use the chosen voice (one of 5 named voices mapped to provider voice IDs). |
| FR-AUD-02 | The voiceover's word timestamps MUST drive the scene lengths and the word-by-word captions. |
| FR-AUD-03 | Music MUST be mixed under the voiceover (ducking). Sound effects MUST be placed automatically on cuts, clicks and pops. |

### 4.7 Credits and billing (CRD / BILL)
| ID | Requirement |
|---|---|
| FR-CRD-01 | Credits MUST be granted **only** after a verified Dodo webhook (valid signature, event not seen before). |
| FR-CRD-02 | Credits are kept in buckets: `subscription` buckets expire at the end of their period; `purchase` buckets never expire. |
| FR-CRD-03 | Spending MUST use subscription buckets first (earliest expiry first), then purchase buckets. |
| FR-CRD-04 | Starting a job MUST reserve the estimated credits atomically (in a serializable transaction). With too few credits, it MUST return `402` and nothing is reserved. |
| FR-CRD-05 | When a job finishes, the reservation MUST be settled on the actual cost (never more than the reservation). The difference MUST go back to the user. |
| FR-CRD-06 | A failed or cancelled job MUST refund all unused reserved credits automatically. |
| FR-CRD-07 | Every balance change MUST be an append-only ledger entry with a unique idempotency key. The balance MUST always equal the sum of the ledger. |
| FR-CRD-08 | Reservations older than 2 hours with no running job MUST be refunded by a cron job. |
| FR-CRD-09 | A payment refund or chargeback MUST claw back the matching credits. If they were already spent, the balance goes negative and the user MUST NOT start new jobs until it's settled. |
| FR-BILL-01 | Users MUST be able to buy a subscription or a credit pack through Dodo Checkout, and manage or cancel subscriptions through a portal. |
| FR-BILL-02 | Subscription renewal MUST grant that period's credits. Cancelling MUST stop future grants without removing credits already granted, which stay until they expire. |
| FR-BILL-03 | Users MUST be able to see their balance by bucket and their ledger history. |
| FR-BILL-04 | There MUST be no free credits and no free tier. |

### 4.8 Templates (TPL)
| ID | Requirement |
|---|---|
| FR-TPL-01 | Visitors MUST be able to browse the template gallery and preview templates. |
| FR-TPL-02 | "Use this template" MUST create a project that keeps the template's structure, camera moves and timing, and fills its slots from the user's URL and assets. |
| FR-TPL-03 | Text slots MUST enforce their max length. Longer text MUST be shortened by the LLM or auto-fitted, and QA MUST check for overflow. |
| FR-TPL-04 | Template videos SHOULD cost fewer credits than freeform videos. |

### 4.9 Admin (ADM)
| ID | Requirement |
|---|---|
| FR-ADM-01 | An admin MUST be able to toggle kill-switches: pause AI clips, pause all new jobs, or force a fallback model. |
| FR-ADM-02 | An admin MUST be able to publish or unpublish templates and design presets. |

## 5. Non-functional requirements

### 5.1 Performance and scalability (PERF / SCALE)
| ID | Requirement |
|---|---|
| NFR-PERF-01 | Landing page: Largest Contentful Paint ≤ 2.5 s at p75 on 4G. It is served from the CDN (static). |
| NFR-PERF-02 | API p95 latency ≤ 300 ms for reads and ≤ 500 ms for writes (not counting job run time). |
| NFR-PERF-03 | Median time to the first video for a 30 s freeform video ≤ 5 min; ≤ 3 min for a template. |
| NFR-SCALE-01 | The system MUST handle 100k visitors/month (peaks of 5k/hour) with no origin changes. The landing page is served entirely by the CDN. |
| NFR-SCALE-02 | The API MUST sustain 200 requests/second and 1,000 concurrent SSE connections by adding replicas only. |
| NFR-SCALE-03 | The pipeline MUST handle 60 concurrent jobs. A burst of 100 generate requests MUST queue with zero errors. |
| NFR-SCALE-04 | Scaling MUST be possible through configuration alone: replicas, concurrency environment variables and plan limits. |
| NFR-SCALE-05 | Remotion Lambda `framesPerLambda` MUST be set so one render uses a bounded number of functions. The AWS Lambda concurrency quota MUST be raised (≥ 200) before launch. New accounts start very low. |
| NFR-SCALE-06 | Redis MUST run with `maxmemory-policy noeviction` (a BullMQ requirement). Every non-queue key (rate limits, event replay, caches) MUST have a TTL. |
| NFR-SCALE-07 | Large pipeline artifacts (scraped pages, screenshots, scene code, audio) MUST be stored in object storage. Checkpoints hold only references and are pruned after the job finishes. |

### 5.2 Reliability (REL)
| ID | Requirement |
|---|---|
| NFR-REL-01 | API availability ≥ 99.5% per month. |
| NFR-REL-02 | Job success rate ≥ 97%. Failed jobs MUST always refund. |
| NFR-REL-03 | If a provider goes down, the system MUST degrade to a "queued/delayed" state and must not show errors. It retries, then uses the fallback model. |
| NFR-REL-04 | Database point-in-time recovery MUST be enabled. |

### 5.3 Security (SEC)
| ID | Requirement |
|---|---|
| NFR-SEC-01 | Provider API keys MUST exist only in the API and worker. The browser MUST never call AI providers. |
| NFR-SEC-02 | Every request body, query and parameter MUST be validated with zod schemas. |
| NFR-SEC-03 | Rate limits: per IP and per user on all `/v1/*` and `/api/auth/*`. Exceeding them returns `429` with `Retry-After`. |
| NFR-SEC-04 | Webhooks MUST verify signatures against the raw body and deduplicate by event id. |
| NFR-SEC-05 | User-supplied URLs MUST NOT be fetched by our own servers. Scraping is done by Firecrawl. |
| NFR-SEC-06 | LLM-written code MUST be validated against the allowlist and rendered in a sandbox with no secrets, no network access and a timeout. |
| NFR-SEC-07 | Scraped website content MUST be treated as data. LLM outputs MUST be structured and validated with a schema. |
| NFR-SEC-08 | Every database query for user data MUST be scoped by `userId`. |
| NFR-SEC-09 | Security headers are required: strict CSP, HSTS, CORS allowing only `https://kinetiq.so`, and CSRF protection. |
| NFR-SEC-10 | User-uploaded and generated files MUST be served from a **separate registrable domain** (e.g. `kinetiqcontent.com`), never from `*.kinetiq.so`, with `X-Content-Type-Options: nosniff` and `Content-Disposition: attachment` for downloads. Otherwise a malicious upload would be "same-site" and could abuse our cookies. |
| NFR-SEC-11 | Every state-changing request (`POST`/`PUT`/`PATCH`/`DELETE`) MUST have an `Origin` header matching `https://kinetiq.so`. Webhooks are exempt and verified by signature instead. |
| NFR-SEC-12 | Untrusted scene code MUST NEVER run in a process that holds secrets: in production it runs only in the render sandbox (Lambda), never in the API or worker. The render page MUST use a CSP that blocks all network access except our asset origins. |
| NFR-SEC-13 | The scene validator MUST also block sandbox-escape tricks: the identifiers `constructor`, `__proto__` and `prototype`; computed member access with non-literal keys (`obj[x]`); tagged templates; and any string-to-code path. |
| NFR-SEC-14 | Each provider API key MUST have a hard spend cap at the provider (e.g. an OpenRouter key credit limit). Staging and production use separate keys. |
| NFR-SEC-15 | Logs and error reports MUST redact emails, tokens, cookies, signed URLs and API keys. |
| NFR-SEC-16 | Idempotency keys MUST be scoped per user, so one user can never receive another user's stored response. |
| NFR-SEC-17 | Dependencies are pinned by the lockfile and updated through Renovate. GitHub Actions are pinned by commit SHA. |
| NFR-SEC-18 | Free model endpoints (OpenRouter ids ending in `:free`) MAY be used only in local development. Staging and production MUST refuse them at startup: free endpoints can log or train on prompts, which would include customers' websites, scripts and uploads, and their rate limits are too low for real traffic. |

### 5.4 Cost control (COST)
| ID | Requirement |
|---|---|
| NFR-COST-01 | Every job MUST record the cost of each provider call (`ProviderCost`). |
| NFR-COST-02 | Credit prices SHOULD keep a gross margin of ≥ 70% (about 5× the provider cost). |
| NFR-COST-03 | A global spend threshold MUST automatically pause AI clips and alert the admin. |
| NFR-COST-04 | Chat messages that call an LLM (edit classification) MUST count toward a per-user daily cap. Previews for QA MUST render at reduced resolution (e.g. 540p stills). |

### 5.5 Maintainability and testability (MNT)
| ID | Requirement |
|---|---|
| NFR-MNT-01 | Every external dependency (LLM, voice, scraping, video, render, payments, storage, clock, id generator) MUST sit behind an interface and have a fake implementation for tests. |
| NFR-MNT-02 | The full product MUST run locally with `MOCK_PROVIDERS=true` at zero cost. |
| NFR-MNT-03 | CI MUST block a merge if typecheck, lint or tests fail, or if coverage on critical modules drops below its threshold ([TEST_PLAN § 5](TEST_PLAN.md#5-ci-quality-gates)). |
| NFR-MNT-04 | Money and credit logic MUST be pure functions with 100% branch coverage. |
| NFR-MNT-05 | The voice provider (`TTS_PROVIDER`: ElevenLabs, Sarvam or OpenRouter) and the OpenRouter model for each AI role (research, design, director, scene coder, visual QA, edits, plus a default and a fallback) MUST be chosen through environment variables, so switching (e.g. free models in development, Claude or DeepSeek in production) needs a restart, not a code change. Invalid choices MUST stop the service at startup. |

### 5.6 Compliance and legal (LEG)
| ID | Requirement |
|---|---|
| NFR-LEG-01 | Generated visuals MUST NOT use Apple trademarks (the logo, wallpapers, SF Pro, real app icons) or other brands' assets in presets and templates. |
| NFR-LEG-02 | Users MUST be able to delete their account and data. Personal data is minimal: email, name, avatar. |

## 6. Constraints and assumptions

- **Stack:** Next.js, Node.js/Express, BetterAuth, Postgres (Neon) + Prisma, Redis + BullMQ, LangGraph.js, Remotion, OpenRouter, ElevenLabs/Sarvam, Firecrawl, Dodo Payments, Cloudflare R2.
- Visitors per month: 5k expected at launch, up to 100k in the viral case. Paid users: tens to low hundreds.
- Provider prices and limits can change. Every provider sits behind an adapter so it can be swapped.

---
← [PRD](PRD.md) · **Next →** [ARCHITECTURE.md: System Architecture](ARCHITECTURE.md)
