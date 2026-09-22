# TODO: Build Plan

**Kinetiq** · **Last updated:** 2026-09-21

← [TEST_PLAN](TEST_PLAN.md) · **TODO** · [Back to README ↺](README.md)

---

## How to use this file

- **Order:** backend first (Phases 0–12), then a **minimal frontend** (Phases 13–17) that just works end to end, then launch (Phase 18). We redesign the UI later (Phase 19).
- **Every task is done only when:**
  1. its tests pass (see [TEST_PLAN.md](TEST_PLAN.md)),
  2. CI is green,
  3. the related docs are updated.
- `[FR-…]` / `[NFR-…]` tags point to [SRS.md](SRS.md). **Tests** tells you what to write alongside the code.
- Tick `[x]` when done. Don't start a phase until the previous phase's **✅ Exit criteria** are met.
- Work in small PRs: one task or a few related tasks per PR.
- 🔜 = **post-MVP**. Skip it for the first launch. Everything without 🔜 is MVP ([PRD § 6.0](PRD.md#60-mvp-scope-launch-small-secure-from-day-one)).
- 🔒 = a security task. **Security tasks are never skipped or postponed**, even for the MVP.

**Progress overview**

| Phase | Name | Status |
|---|---|---|
| 0 | Repo, tooling, CI | ✅ |
| 1 | Shared contracts (zod) | ✅ |
| 2 | Database (Prisma) | ✅ |
| 3 | API skeleton + auth | ✅ |
| 4 | Projects, chat, uploads | ✅ |
| 5 | Credits domain + ledger | ✅ |
| 6 | Queue, jobs, realtime events | ⬜ |
| 7 | Renderer + scene sandbox | ⬜ |
| 8 | Pipeline on fakes (LangGraph) | ⬜ |
| 9 | Real providers | ⬜ |
| 10 | Audio, edits, versions | ⬜ |
| 11 | Billing (Dodo) | ⬜ |
| 12 | Templates, admin, hardening, production infra | ⬜ |
| 13 | Frontend setup (minimal) | ⬜ |
| 14 | Frontend: auth + landing | ⬜ |
| 15 | Frontend: project page | ⬜ |
| 16 | Frontend: billing + templates | ⬜ |
| 17 | End-to-end tests | ⬜ |
| 18 | Launch readiness | ⬜ |
| 19 | Later: redesign + v1.x | ⬜ |

---

# BACKEND

## Phase 0: Repo, tooling, CI
> Goal: an empty but fully wired monorepo where tests and CI already work.

- [x] `git init`, `.gitignore` (node_modules, .env, out, .turbo, coverage), first commit
- [x] pnpm workspace + Turborepo: `pnpm-workspace.yaml`, `turbo.json` (`build`, `typecheck`, `dev`). Lint and tests run once from the root with ESLint and Vitest projects, which is faster
- [x] Create folders (empty packages with `package.json` and `tsconfig.json`):
  - `apps/api`, `apps/worker`, `apps/web` (web created in Phase 13)
  - `packages/shared`, `packages/domain`, `packages/db`, `packages/primitives`, `packages/renderer`
- [x] Base `tsconfig.base.json`: strict, `noUncheckedIndexedAccess`, ES2022, path aliases `@kinetiq/*`
- [x] ESLint + Prettier shared config. Custom rule for `packages/domain`: ban `new Date()`, `Date.now()`, `Math.random()` (testability rule T3)
- [x] Vitest workspace config, with coverage via v8 and per-package thresholds ([TEST_PLAN § 5](TEST_PLAN.md#5-ci-quality-gates))
- [x] **Move `primitives/` → `packages/primitives`**. It's now a pnpm workspace package with a public `index.ts` API and an `entry.ts` for studio/render, under the strict shared tsconfig and lint. The demos (`Showcase`, `RefIntro`) still render. Motion math has unit tests. zod is pinned to Remotion's version (4.5.4) across the repo
- [x] `infra/docker-compose.yml`: Postgres 16, Redis 7, MinIO (plus a bucket-init container)
- [x] `.env.example`: every variable documented (DB, Redis, R2/MinIO, BetterAuth, Google OAuth, Turnstile, OpenRouter, ElevenLabs, Sarvam, Firecrawl, Dodo, AWS/Remotion, Sentry, LangSmith, Resend, `MOCK_PROVIDERS`, `RENDER_MODE`). `.env` stays git-ignored
- [x] Typed config loader in `packages/shared/src/config.ts` (zod-validated env; the app crashes on start if config is invalid)
- [x] GitHub Actions `ci.yml`: install → build → typecheck → lint → test → coverage gate → test:int (with Postgres and Redis service containers) → gitleaks → `pnpm audit --prod`
- [x] Root scripts: `pnpm dev`, `pnpm test`, `pnpm test:int`, `pnpm check`, `pnpm infra:up/down` (`db:migrate` and `db:seed` arrive with Phase 2)
- [x] Re-render the primitives demos with the Kinetiq name (`packages/primitives/out/`: showcase, ref-intro, compare)
- [x] 🔒 Renovate for dependency updates. Every GitHub Action pinned by commit SHA. gitleaks runs in CI; a local pre-commit hook is optional (install the gitleaks binary) [NFR-SEC-17]
- [x] 🔒 pnpm only runs install scripts for allowlisted packages (`allowBuilds`: esbuild only)

**Tests:** a sample unit test in each package runs in CI. The lint rule fails on `Date.now()` inside the domain package.
**✅ Exit criteria:** `docker compose up -d && pnpm i && pnpm test` passes locally and CI is green on the first PR.

---

## Phase 1: Shared contracts (`packages/shared`)
> Goal: every data shape is defined once and used everywhere (rule T5).

- [x] ID helpers and types (`prj_`, `job_`, `ver_`, `ast_`, `tpl_`, `usr_`…)
- [x] API schemas (request + response) for every endpoint in [API.md](API.md): projects, messages, estimate, generate, jobs, versions, uploads, brand kits, catalog, billing, me
- [x] Error schema + error codes enum ([API § 1](API.md#1-conventions))
- [x] SSE `ProjectEvent` discriminated union ([API § 8](API.md#8-realtime-events-sse))
- [x] Queue payload schemas (`generate`, `edit`, `render`, `media-poll`, `email`) ([API § 16](API.md#16-internal-queues-worker-contracts))
- [x] Model registry: UI model → provider id, allowed durations and ratios, credits per clip
- [x] Plan and credit tables (placeholder values, prices TBD): plan codes, monthly credits, concurrency, feature flags; credit costs per action
- [x] Voices (5) and design presets as static data
- [x] LLM structured-output schemas: `ResearchResult`, `DesignTokens`, `DirectorPlan` (scenes, timings), `QaReport`, `EditIntent`

**Tests:** valid and invalid examples for every schema. The request limits from [SRS § 4.2](SRS.md#42-projects-and-inputs-prj) are enforced (https-only URL, durations, ratios, asset count).
**✅ Exit criteria:** `packages/shared` has 100% test pass and ≥ 90% coverage. **Done: 117 contract tests, 100% statements and branches.**

**Notes from the build:**
- Requests use strict objects: unknown fields are rejected (no mass assignment, e.g. a client can't send `userId` or `status`).
- `PublicUrl` also rejects IP addresses, `localhost`, internal hostnames, credentials in the URL and custom ports.
- The catalog has placeholder prices (`priceUsdCents: null`); checkout must refuse unpriced items until pricing is decided in Phase 18.
- AI video model ids are the ones from OpenRouter's docs and are all disabled; re-check them in Phase 10.

---

## Phase 2: Database (`packages/db`)
> Goal: the full data model plus repositories that always require `userId`.

- [x] Prisma schema for every model in [ARCHITECTURE § 7](ARCHITECTURE.md#7-data-model-prisma):
  - BetterAuth tables
  - Project, Message, Asset, BrandKit
  - Job, JobStep, Version, Scene
  - Template, TemplateSlot (Plan and CreditPack stay in code: `packages/shared/src/catalog.ts`)
  - Subscription, CreditBucket, CreditLedger, Payment
  - WebhookEvent, ProviderCost, FeatureFlag, IdempotencyRecord
- [x] Constraints: unique `CreditLedger.idempotencyKey`, unique `(provider, eventId)` on WebhookEvent, unique `Subscription.dodoId`, indexes on `(userId, createdAt)`
- [x] Money and credits are integers only (no floats)
- [x] First migration + `pnpm db:migrate`
- [x] Repositories (`projectsRepo`, `jobsRepo`, `versionsRepo`, `assetsRepo`, `ledgerRepo`…). **Every method that reads user data takes `userId`** [NFR-SEC-08]
- [x] Seed script (idempotent): default feature flags, the unpublished "Desktop story" template, and a local-only admin user. Plans, packs, voices and presets live in code, not the database
- [x] Test helpers: a throwaway `kinetiq_test` database recreated from the migrations before every integration run (on the Docker Compose Postgres; same in CI), `resetDb()`, factories (`makeUser`, `grantCredits`)

**Tests (integration):** migrations apply cleanly. Repos never return another user's rows. Unique constraints hold.
**✅ Exit criteria:** `pnpm test:int` runs against a real Postgres container in CI. **Done: 29 integration tests.**

**Notes from the build:**
- Prisma **7.10** (stable). Prisma's `latest` tag points to an 8.0 release candidate, which we skip.
- Database-level safety rules in the init migration: CHECK constraints (ratios, durations, upload types, credit signs, bucket bounds, charged ≤ reserved) and a trigger that makes `credit_ledger` **append-only**.
- The ledger → bucket foreign key is `NO ACTION`, so account deletion works with the append-only trigger (tested).
- Ids are time-sortable (`prj_` + 26 chars), so pagination is simply `ORDER BY id DESC`.
- ⚠ Local dev database: reset it once with `pnpm --filter @kinetiq/db exec dotenv -e ../../.env -- prisma migrate reset` (Prisma requires the user's own consent for resets).

---

## Phase 3: API skeleton + auth (`apps/api`)
> Goal: a secure, testable Express app with login working.

- [x] `container.ts` composition root. `buildApp(container)` returns an Express app, so tests use fakes (rule T4)
- [x] Middleware:
  - request id
  - JSON logger (pino) with `requestId` / `userId`
  - helmet (strict CSP, HSTS)
  - CORS allowing only the web origin
  - body size limit (1 MB)
  - zod validation helper
  - error handler mapping domain errors to [API error codes](API.md#error-format)
- [x] BetterAuth: email magic link (via `EmailPort`, fake in tests) + Google OAuth. Cookie `.kinetiq.so`, httpOnly, Secure, SameSite=Lax [FR-AUTH-01, 02, 05]
- [x] Turnstile check on sign-up/magic-link (`CaptchaPort`, fake in tests) [FR-AUTH-03]
- [x] `requireAuth` middleware; `requireAdmin`
- [x] Rate limiter middleware (Redis sliding window, `rate-limiter-flexible`) with limits from config ([API § 17](API.md#17-rate-limits-defaults-set-through-config)) [NFR-SEC-03]
- [x] Idempotency middleware (`Idempotency-Key` → stored response for 24 h; different body → `409 IDEMPOTENCY_MISMATCH`)
- [x] 🔒 `Origin` check middleware on every state-changing `/v1` request (webhooks exempt) [NFR-SEC-11]
- [x] 🔒 Magic-link limit per email (3/hour) + per IP; identical responses for known and unknown emails [FR-AUTH-06]
- [x] 🔒 Admin 2FA (BetterAuth two-factor plugin, with brute-force lockout); link accounts only for verified emails [FR-AUTH-07]. `requireAdmin` needs role=admin **and** 2FA enabled. ⏭ Per-request TOTP step-up for the admin HTTP API moves to Phase 12 (the MVP has no admin HTTP API)
- [x] 🔒 Log redaction [NFR-SEC-15]: requests are logged as method + path only (no query strings, headers or bodies), and known secret fields are redacted. ⏭ Sentry `beforeSend` scrubbing moves to Phase 12, when Sentry is added
- [x] 🔒 Idempotency keys stored as `(userId, key)` [NFR-SEC-16]
- [x] `GET /healthz`, `GET /readyz`
- [x] `GET /v1/me`, `DELETE /v1/me` [NFR-LEG-02]

**Tests:**
- 401 without a session
- the cookie has the right flags
- 429 after the limit, with `Retry-After`
- idempotency replay and mismatch
- security headers present
- account deletion removes the user's data

**✅ Exit criteria:** you can log in locally with a magic link (the email is printed to the console in dev) and `GET /v1/me` works. **Done: verified by a local server run and the integration tests.**

**Notes from the build:**
- BetterAuth **turns off its origin and callback-URL checks when `NODE_ENV=test`**. We set `disableOriginCheck: false` and `disableCSRFCheck: false` explicitly, so the tests exercise the real protections and no environment variable can ever switch them off.
- BetterAuth telemetry is disabled; its in-process rate limiter is replaced by our Redis limiter (shared by all replicas).
- Magic-link tokens are stored hashed and are single-use; links expire after 10 minutes.
- Prisma 7 no longer regenerates the client after `migrate dev`; `pnpm db:migrate` now does it.
- Coverage is measured on unit + integration tests together (CI integration job).

---

## Phase 4: Projects, chat, uploads
> Goal: users can create projects, chat, and upload assets safely.

- [x] `StoragePort` + adapters: `MinioStorage` (dev), `R2Storage` (prod), `MemoryStorage` (tests)
- [x] 🔒 `POST /v1/uploads` (presigned PUT with a signed content type; **the server generates the key**) + `POST /v1/uploads/:id/complete` (HEAD + magic-byte sniff). Allowed: png/jpg/webp ≤ 10 MB, mp4/webm ≤ 100 MB. **SVG and HTML are never accepted** [FR-PRJ-04, 05]
- [ ] 🔒 Worker `ffprobe` check on uploaded videos (codec, duration ≤ 2 min, dimensions) before use [FR-PRJ-04]. ⏭ Moved to Phase 6 (needs the worker). Until then videos stay in `processing` and can't be attached
- [x] 🔒 Serve all user files and renders from the **separate domain `kinetiqcontent.com`** with `nosniff` + `Content-Disposition: attachment` on downloads [NFR-SEC-10]
- [x] Projects CRUD: `POST /v1/projects`, `GET /v1/projects` (cursor), `GET /v1/projects/:id`, `DELETE` [FR-PRJ-01…03]
- [x] Messages: `GET /v1/projects/:id/messages`, `POST` (idempotent) [FR-CHAT-03, 04]
- [x] Setup dialog state machine (pure, in `packages/domain/setup`, **no LLM calls** [FR-GEN-13]): which question to ask next (voiceover → voice → language → script → design style), and applying answers to project settings [FR-CHAT-01, 02]
- [x] Brand kits: `POST /v1/brand-kits` (paste or upload a DESIGN.md → parse tokens, 20 KB cap)
- [x] Catalog: `GET /v1/voices`, `/v1/design-presets`, `/v1/templates`, `/v1/billing/plans` with `Cache-Control`

**Notes from the build:**
- Uploads use a **presigned PUT** (R2 has no presigned POST). The content type is signed; size and file bytes are verified on `complete`, and mismatches are deleted.
- New asset status `processing` for videos waiting for the worker's probe.
- Deleting a project with a running job returns 409 until cancel/refund exists (Phase 6).
- ⏭ Phase 6 cron: delete storage objects of deleted projects/assets and of uploads never completed.
- ⏭ Phase 13: CORS rules on the MinIO/R2 bucket so the browser can PUT directly.

**Tests:**
- IDOR returns 404 for another user's project, asset or message
- invalid inputs return 400 with field errors
- a fake PNG (actually HTML) is rejected
- oversized files are rejected
- the setup state machine is covered 100%
- pagination works

**✅ Exit criteria:** with Postman or curl you can create a project, upload a screenshot, and answer the setup questions. **Done: covered by 45 API integration tests (incl. real MinIO).**

---

## Phase 5: Credits domain + ledger (highest risk: money)
> Goal: correct, race-safe credit accounting. **100% branch coverage** [NFR-MNT-04].

- [x] `packages/domain/credits`, all pure functions:
  - `estimate(projectSettings, table)` → `{ credits, breakdown }` [FR-GEN-01]
  - `planReservation(buckets, amount, now)` → which buckets to debit, subscription buckets first, earliest expiry first [FR-CRD-02, 03]
  - `settle(reserved, actualCost)` → charge ≤ reserved, refund the rest [FR-CRD-05]
  - `refundAll(reservation)` [FR-CRD-06]
  - `expireBuckets(buckets, now)`
  - `editCost(editIndex)`: first 3 edits free [FR-EDIT-05]
- [x] `CreditsService` (in `apps/api` + worker) applies the plans to the DB in **SERIALIZABLE** transactions with retry on serialization failure. Every change is a ledger row with an idempotency key [FR-CRD-04, 07]
- [x] `POST /v1/projects/:id/estimate` (the same `estimate()` the reservation uses)
- [x] `GET /v1/billing/ledger`
- [x] Admin/dev-only script to grant test credits (never exposed publicly)
- [x] 🔒 `clawback(amount)` for refunds and chargebacks; a negative balance blocks `generate` with `402` [FR-CRD-09]

**Tests:**
- unit tests for every branch
- **property test (fast-check):** after any random sequence of grant, reserve, settle, refund and expire, `balance == SUM(ledger)` and balance ≥ 0 (only `clawback` may push it negative)
- **race test:** 2 parallel reserves with enough credits for one → exactly one succeeds
- 402 without credits, and no ledger rows are written

**✅ Exit criteria:** coverage gate at 100% branches on `domain/credits`. The race test is stable across 50 runs. **Done: 100% statements/branches/functions/lines; the race test runs 50 rounds per CI run.**

**Notes from the build (two real bugs caught before they shipped):**
- **Double refund:** a fully charged job leaves no closing ledger line, so settling it again (a retry or the stale-reservation cron) would have refunded spent credits. Settling is now exactly-once per job: `job.chargedCredits` is set in the same serializable transaction, and a second settle throws `AlreadySettled` (tested).
- **Vanishing debt:** if a chargeback happened while a job was running, the job's refund would refill buckets while the user still owed credits. Refunds now pay off debt first.
- Invariant enforced everywhere (and by 1,000 random sequences in the domain plus 25 against the real database): **credits in buckets = max(0, ledger balance)**; buckets stay within 0…granted.
- Every credit write runs in a SERIALIZABLE transaction with retry; ledger idempotency keys are `<operation>#<line>`.
- `/v1/me` `credits.total` is the spendable balance, or a negative number while the user owes credits.
- Dev-only `pnpm credits:grant --email … --amount …` refuses to run unless `APP_ENV=local`.

---

## Phase 6: Queue, jobs, realtime events
> Goal: slow work runs in the background, and the browser sees live progress.

- [ ] `QueuePort` (BullMQ adapter + in-memory fake); queues `generate`, `edit`, `render`, `media-poll`, `email`, `cron`
- [ ] `EventBusPort` (Redis pub/sub adapter + in-memory fake); channel `project:{id}`; the last 100 events are stored for replay
- [ ] `POST /v1/projects/:id/generate`: validate → reserve credits → create Job → enqueue → `202` [FR-GEN-02]
  - `409` if a job is already running; `429 CONCURRENCY_LIMIT` per plan [FR-GEN-10]; `503` if the `pause_new_jobs` flag is on
- [ ] `GET /v1/jobs/:id`, `POST /v1/jobs/:id/cancel` (refunds unused credits) [FR-GEN-09]
- [ ] `GET /v1/projects/:id/events` (SSE): auth, heartbeat every 15 s, `Last-Event-ID` replay, at most 5 connections per user
- [ ] Worker app skeleton: `container.ts`, processors, graceful shutdown, `WORKER_CONCURRENCY` env var
- [ ] Queue position calculation + `job.queued` events
- [ ] Job deadline (default 20 min) + BullMQ stalled-job detection → fail and refund [FR-GEN-11]
- [ ] Redis `maxmemory-policy noeviction`; a TTL on every rate-limit, replay and cache key; a startup check that refuses to boot if the policy is wrong [NFR-SCALE-06]
- [ ] Cron jobs: stale reservations older than 2 h → refund [FR-CRD-08]; expire subscription buckets; clean orphaned uploads

**Tests:**
- generate → job queued → a fake processor emits events → SSE client receives them in order
- reconnect replay works
- cancel refunds
- the concurrency limit applies
- the cron refunds stale reservations (using `FixedClock`)

**✅ Exit criteria:** a dummy job flows API → queue → worker → SSE end to end locally.

---

## Phase 7: Renderer + scene sandbox (`packages/renderer`)
> Goal: render LLM-written scene code safely from one deployed bundle.

- [ ] AST allowlist validator in `packages/domain/validator` ([ARCHITECTURE § 6](ARCHITECTURE.md#6-dynamic-scene-runtime-sandbox)) [FR-GEN-06, NFR-SEC-06]:
  - imports only from `react`, `remotion` and `@kinetiq/primitives`
  - bans `eval`, `Function`, `import()`, `require`, `fetch`, XHR, WebSocket, `window`, `document`, `globalThis`, timers and storage
  - code must be under 30 KB
- [ ] 🔒 The validator also blocks escape tricks: `constructor`, `__proto__`, `prototype`, computed member access with non-literal keys, tagged templates, string-to-code [NFR-SEC-13]
- [ ] 🔒 Renderer page CSP: `default-src 'none'`; assets only from our content domain and the font origin [NFR-SEC-12]
- [ ] 🔒 Production guard: the API and worker containers can't evaluate scene code. `RENDER_MODE=local` is refused when `NODE_ENV=production` [NFR-SEC-12]
- [ ] Transpile step (sucrase/esbuild) → a JS string
- [ ] Renderer Remotion root:
  - `DynamicScene` evaluates code with a whitelisted scope (React, remotion, primitives, theme)
  - `FinalVideo` = scenes (Series/TransitionSeries) + audio tracks + captions + `Lens`
  - supports all ratios (16:9, 9:16, 1:1) and 30 fps
- [ ] `RenderPort`: `renderStill()`, `renderFinal()`. Adapters: `LocalRender` (@remotion/renderer) and `LambdaRender` (@remotion/lambda, in Phase 12)
- [ ] Render timeout + failure mapping
- [ ] Primitives docs file (`packages/primitives/API.md`) generated from the code. It goes into the scene-coder prompt (cached)

**Tests:**
- the malicious corpus is 100% rejected
- valid samples pass
- visual baselines for every primitive and for `RefIntro` at chosen frames (pixelmatch ≤ 0.1%)
- output spec checked with ffprobe: duration ±0.5 s, resolution and fps per ratio [FR-GEN-08]
- an infinite-loop scene times out cleanly

**✅ Exit criteria:** a hand-written scene JSON renders to MP4 locally through `RenderPort`.

---

## Phase 8: Pipeline on fakes (`apps/worker`, LangGraph.js)
> Goal: the whole generation graph works at zero cost with `MOCK_PROVIDERS=true`.

- [ ] Ports: `LlmPort`, `ScraperPort`, `VoicePort`, `VideoGenPort`, `MusicPort`. Fakes: `FakeLlm` (scripted by role), `FakeScraper` (fixture sites), `FakeVoice`, `FakeVideoGen`
- [ ] Fixture sites in `fixtures/sites/` (10 "golden" startups)
- [ ] Nodes as pure-ish functions `(state, ports) → patch` (rule T6) [FR-GEN-03]:
  - `research`, `designMd`, `director`, `voiceover`, `sceneCoder` (parallel)
  - `validate`, `previewStills`, `visualQA` + `sceneFix` loop (max 2) [FR-GEN-07]
  - `aiClips`, `audio`, `finalRender`, `settle`, `notify`
- [ ] LangGraph wiring + Postgres checkpointer; retry at most 3 times from the checkpoint [FR-GEN-05]
- [ ] Each node emits `step.*` events with thumbnails [FR-GEN-04]
- [ ] Screenshot fallback path when the UI rebuild fails QA twice [FR-GEN-07]
- [ ] `ProviderCost` recording in every adapter [NFR-COST-01]
- [ ] Research cache per normalized URL (24 h, stored in R2 and keyed in Redis) [FR-GEN-12]
- [ ] Big artifacts go to R2 with references in checkpoints; prune checkpoints when the job ends [NFR-SCALE-07]
- [ ] QA previews at 540p; visual QA fix loop capped at 1 round for the MVP (config) [NFR-COST-04]
- [ ] `MOCK_PROVIDERS=true` wires every fake in the container [NFR-MNT-02]

**Tests:**
- each node alone
- a full graph run on a fixture site produces an MP4 and a version
- a node fails twice then succeeds without re-running earlier nodes (count FakeLlm calls)
- the QA loop is capped
- the fallback triggers
- credits are settled correctly at the end

**✅ Exit criteria:** `pnpm dev` with mocks gives URL → MP4 through the API, visible live over SSE.

---

## Phase 9: Real providers
> Goal: swap fakes for real adapters with **no domain changes**.

- [ ] Load the `/claude-api` skill before writing LLM code. `OpenRouterLlm`: Claude model ids from config, structured outputs validated with zod, prompt caching of the primitives docs and DESIGN.md, fallback model, per-provider BullMQ rate limiter, circuit breaker [NFR-REL-03]
- [ ] `FirecrawlScraper`: markdown + screenshots + branding; user URLs only ever go to Firecrawl [NFR-SEC-05]
- [ ] Prompts in `apps/worker/src/prompts/`, versioned: director, designMd, sceneCoder, visualQA, editClassifier. Scraped text is wrapped as data [NFR-SEC-07]
- [ ] Contract tests using recorded responses (secrets removed) through MSW
- [ ] `evals/` runner: golden sites → structure validity, allowlist pass rate, QA pass rate, overflow, cost and time per video [NFR-PERF-03]
- [ ] Staging config with low spend limits
- [ ] 🔒 A hard spend cap on every provider key (OpenRouter key limit, ElevenLabs plan cap, Firecrawl plan); separate staging and prod keys [NFR-SEC-14]
- [ ] Per-user daily cap on LLM-calling chat messages [NFR-COST-04]

**Tests:** adapter contract tests. The eval run meets targets (e.g. allowlist pass ≥ 95%, QA pass ≥ 85%).
**✅ Exit criteria:** a real 15 s video from a real URL on staging, and its cost is recorded.

---

## Phase 10: Audio, edits, versions
- [ ] `ElevenLabsVoice` (5 named voices mapped to provider voice ids) + 🔜 `SarvamVoice` (Indian languages). Word timestamps drive scene lengths and captions [FR-AUD-01, 02]
- [ ] Music + SFX: `MusicPort` (MVP: a small royalty-free music library; 🔜 generated music) + an SFX cue planner (pure: cut list → cues), ducking under the voiceover in the final mix [FR-AUD-03]
- [ ] Edit graph: `classifyEdit` → affected nodes and scenes → re-run → new Version; unchanged scene code is reused byte-for-byte [FR-EDIT-01…03]
- [ ] Versions API: list, restore (creates a copy), download/stream signed URLs [FR-EDIT-04]
- [ ] Free-edit counter + edit credit charging [FR-EDIT-05]
- [ ] 🔜 AI clips: `OpenRouterVideo` (submit → callback `/v1/webhooks/video/:token` with a single-use HMAC token, plus `media-poll` fallback). Plan-gated, with the kill-switch [F14, NFR-COST-03]

**Tests:**
- audio timeline unit tests
- the edit re-runs only scene N (scene-code hash comparison)
- restore creates a new version
- a bad callback token is rejected
- AI clips are blocked when the flag is off or the plan disallows them

**✅ Exit criteria:** generate → chat edit → V2 → restore V1 → download, all working on staging.

---

## Phase 11: Billing (Dodo Payments)
- [ ] `PaymentsPort` + `DodoPayments` adapter + `FakePayments`
- [ ] `POST /v1/billing/checkout` (plan or pack, idempotent), `POST /v1/billing/portal` [FR-BILL-01]
- [ ] `POST /v1/webhooks/dodo` [FR-CRD-01, FR-BILL-02, NFR-SEC-04]:
  - raw-body signature check, then `WebhookEvent` deduplication
  - amount checked against the server price table
  - handles `payment.succeeded`, `subscription.active` / `renewed` / `cancelled` / `failed`, `refund.succeeded`
- [ ] 🔒 Handle `refund.succeeded` and dispute/chargeback events → `clawback` [FR-CRD-09]
- [ ] MVP catalog: **1 subscription plan + 2 credit packs** (prices decided in Phase 18)
- [ ] Daily reconciliation cron against Dodo subscriptions
- [ ] Emails through Resend (`EmailPort`): receipt, credits added, low balance

**Tests:**
- a forged signature returns 401
- a replayed event grants credits once
- a wrong amount grants nothing and logs an alert
- renewal creates a subscription bucket
- cancel stops future grants
- the success page never changes the balance

**✅ Exit criteria:** a full purchase in Dodo **test mode** on staging adds credits exactly once.

---

## Phase 12: Templates, admin, hardening, production infrastructure
- [ ] 🔜 Templates backend: Template + slots, the `fillTemplate` node (replaces `director`), text fitting and max length, template credit discount [FR-TPL-01…04]
- [ ] 🔜 Template #1 **"Desktop story"** from `RefIntro`, with slots (logo, name, headline, notification text, product UI)
- [ ] Admin: MVP = a CLI script for flags (`pnpm flags set pause_new_jobs true`); 🔜 full admin API: flags (`pause_ai_clips`, `pause_new_jobs`, `force_fallback_model`), template publishing, cost report [FR-ADM-01, 02]
- [ ] Automatic spend threshold → pause AI clips + alert [NFR-COST-03]
- [ ] 🔒 `LambdaRender`: deploy the renderer site + function (no secrets, IAM role that can only write to the renders bucket), render webhook `/v1/webhooks/render`; **request the AWS concurrency increase early (it can take days)**; set `framesPerLambda` to cap functions per render [NFR-SCALE-05]
- [ ] Production infrastructure:
  - Railway services (API ×2, worker, Redis) with staging and prod environments
  - Neon main + staging branch, PITR on [NFR-REL-04]
  - R2 buckets (public examples, private renders/assets), lifecycle rule deleting drafts after 30 days, custom domain `cdn.kinetiq.so`
  - Cloudflare: DNS, WAF, rate-limit rules, Turnstile keys
- [ ] Observability: Sentry (API + worker), LangSmith traces per job, structured logs, alerts on queue depth / wait p95, job failure rate, daily spend, 5xx rate, webhook failures
- [ ] Run `/security-review` on the backend and fix findings

**Tests:**
- template fill unit tests
- visual tests of the template in every ratio
- admin endpoints are admin-only
- kill-switch tests
- all security tests from [TEST_PLAN § 6.4](TEST_PLAN.md#64-security)

**✅ Exit criteria:** the staging backend is complete. Postman or curl can do everything in [API.md](API.md).

---

# FRONTEND (minimal: working first, redesign later)

> Rule: **plain but correct.** Use shadcn/ui defaults, no custom animations. Every page talks to the real API with types from `packages/shared`.

## Phase 13: Frontend setup (`apps/web`)
- [ ] Next.js (App Router) + Tailwind + shadcn/ui init
- [ ] Typed API client (`fetch` wrapper with `credentials: 'include'`; parses responses with the shared zod schemas; maps errors to toasts)
- [ ] `useProjectEvents(projectId)` SSE hook with auto-reconnect + `Last-Event-ID`
- [ ] TanStack Query for server state
- [ ] Layout: header (logo, credits badge, login/avatar), toaster
- [ ] Sentry + PostHog (page views + funnel events)
- [ ] Vitest + Testing Library + MSW set up for components

**✅ Exit criteria:** `pnpm dev` shows a page that calls `/v1/me` successfully.

## Phase 14: Frontend auth + landing
- [ ] Landing (**static/SSG**): hero + chat box (URL, duration, ratio, model, attachments) + the "more assets = better video" hint [FR-PRJ-06]; a simple example gallery (poster + `<video preload="none">`); a pricing section from `/v1/billing/plans`
- [ ] Draft saved in `localStorage` when logged out → `/login` → `/new` restores it and creates the project [FR-AUTH-04]
- [ ] `/login`: email magic link + Google button + Turnstile
- [ ] Attachments: presigned upload with a progress bar, then `complete`

**Tests:** the chat box validation component; the draft-survives-login logic; the upload flow with MSW.

## Phase 15: Frontend project page (the core screen)
Two panes, following [`../image.png`](../image.png):
- [ ] **Left: chat.** Message list; widgets for `choice`, `voicePicker` (plays preview clips), `designPicker` (auto / upload / paste / presets), `estimate` (credits + confirm button); input box; sending uses an `Idempotency-Key`
- [ ] **Right: live pane.** Step timeline (research → style → script → scenes N/M → audio → render) from SSE, with thumbnails; queue position; errors and retries; then a video player for the latest version
- [ ] Versions dropdown (V1, V2…) + restore + download button
- [ ] Cancel job button
- [ ] `/projects` list page (my projects)
- [ ] States: 402 → "buy credits" dialog; 429 → "you have a job running"; 503 → "busy, queued"

**Tests:** component tests for every widget; the SSE hook handling reconnects; the estimate → generate flow with MSW.

## Phase 16: Frontend billing + templates
- [ ] `/billing`: balance by bucket, plans + packs → checkout redirect, "manage subscription" portal link, ledger table
- [ ] 🔜 `/templates` gallery + template detail → "Use this template" → a project with `templateId`
- [ ] 🔜 Minimal `/admin` page (flags toggles, template publish), admins only

**Tests:** billing page states; the template → project flow.

---

## Phase 17: End-to-end tests (Playwright, on fakes)
- [ ] Journeys ([TEST_PLAN § 7](TEST_PLAN.md#7-traceability-matrix)):
  1. landing → draft → login → project created
  2. setup questions → estimate → generate → live steps → video → download
  3. chat edit → V2 → restore V1
  4. buy credits (fake Dodo webhook) → balance updates
  5. 0 credits → 402 dialog
  6. 🔜 use template → video
  7. user B can't open user A's project
- [ ] Smoke subset on every PR; full suite nightly

**✅ Exit criteria:** all journeys green in CI with `MOCK_PROVIDERS=true`.

---

## Phase 18: Launch readiness
- [ ] k6 load tests ([TEST_PLAN § 8](TEST_PLAN.md#8-load-test-plan-k6)): landing via CDN, API 200 req/s, 1k SSE connections, a burst of 100 generate calls [NFR-SCALE-01…03]
- [ ] Lighthouse CI: landing LCP ≤ 2.5 s [NFR-PERF-01]
- [ ] Real-provider runs: 10 golden sites × (15 s, 30 s); check the cost per video, then **decide on credit prices** (pricing discussion)
- [ ] Final `/security-review` + OWASP ZAP baseline on staging
- [ ] Legal: terms, privacy, refund policy pages; check for trademarks ([NFR-LEG-01](SRS.md#56-compliance-and-legal-leg))
- [ ] Produce 6–10 example videos for the landing gallery
- [ ] Buy the kinetiq.so domain, set production env and secrets, switch Dodo to live mode
- [ ] [TEST_PLAN § 9 release checklist](TEST_PLAN.md#9-release-checklist) all ticked → **launch** 🚀

---

## Phase 19: Later (after launch)
- [ ] **Frontend redesign** (landing, project page, motion polish)
- [ ] Better macOS primitives at real resolution + a code-drawn MacBook/iPhone frame + 3D tilt
- [ ] More templates (10–15), "Save my video as a template"
- [ ] Regional pricing
- [ ] 3D device mockups (`@remotion/three`)
- [ ] Team workspaces, public API, timeline editor (see [PRD § 6.3](PRD.md#63-later))

---
← [TEST_PLAN](TEST_PLAN.md) · **Back to start ↺** [README.md](README.md)
