# TEST_PLAN: Test Plan and Testing Strategy

**Kinetiq** · **Status:** Draft v1 · **Last updated:** 2026-09-21

← [API](API.md) · **TEST_PLAN** · [TODO →](TODO.md)

---

## 1. Goal and principles

**Goal:** every requirement in [SRS.md](SRS.md) is proven by an automated test, and CI blocks any change that breaks one. We write code **so that it can be tested**, instead of hoping it works.

1. **Tests are part of the feature.** No test means not done ([README golden rule](README.md#golden-rules-for-everyone-humans-and-ai)).
2. **Zero-cost tests.** No test ever calls a real AI provider, payment gateway or AWS by default. We use fakes and recorded responses.
3. **Deterministic.** The same input gives the same result every time: fixed clock, seeded ids, no network, no sleeps.
4. **Fast feedback.** Unit tests run in seconds, the full CI in under 10 minutes.
5. **Test behavior, not implementation.** Assert on outputs, state and contracts, not internal calls.

## 2. Testability rules (how we write code)

These rules are what make the code testable. Code review rejects anything that breaks them.

| # | Rule | Example |
|---|---|---|
| T1 | **Business logic is pure.** Credits, estimates, validators, slot filling and edit classification take plain inputs and return plain outputs. | `settle({ reserved: 23, actualCost: 21, buckets })` → ledger entries. No database inside. |
| T2 | **Every external system sits behind a port.** Adapters live at the edges ([ARCHITECTURE § 8](ARCHITECTURE.md#8-testable-code-architecture-ports-and-adapters)). | `LlmPort.complete()`, `RenderPort.renderStill()`, `PaymentsPort.createCheckout()` |
| T3 | **No hidden globals.** Time comes from `ClockPort`, ids from `IdPort`, randomness from a seeded RNG, config from a typed `Config` object. | `new Date()` and `Math.random()` are banned in `packages/domain` (enforced by a lint rule). |
| T4 | **One composition root per app.** Dependencies are wired in `container.ts`, and tests build the container with fakes. | `buildContainer({ llm: new FakeLlm(script) })` |
| T5 | **Contracts are zod schemas** shared by producer and consumer (API bodies, SSE events, queue payloads, LLM structured outputs). | `ProjectEvent.parse(data)` on both sides |
| T6 | **Pipeline nodes are functions** `(state, ports) → Promise<statePatch>`, testable one at a time without any pipeline engine (our runner today, LangGraph if we ever switch; ARCHITECTURE §5.2). | `await sceneCoder(state, { llm: fakeLlm })` |
| T7 | **Small modules, explicit errors.** Domain errors are typed (`InsufficientCredits`, `ValidationRejected`), never string-matched. | `expect(() => reserve(...)).toThrow(InsufficientCredits)` |
| T8 | **Every bug fix starts with a failing test** that reproduces it. | A regression test is named after the issue id |
| T9 | **Idempotency by design.** Any handler that can be retried (webhooks, jobs, POST with a key) has a "run it twice" test. | Same Dodo event twice → credits granted once |

## 3. Test levels (the pyramid)

```
                 ▲  E2E (Playwright)          ~15 journeys      slow, few
                ▲▲▲ Visual + LLM evals        stills diff, golden sites
              ▲▲▲▲▲ Integration (API/worker)  real Postgres/Redis (Docker Compose), fakes for providers
          ▲▲▲▲▲▲▲▲▲ Contract (zod, MSW)       every endpoint/event/queue/provider response
   ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲ Unit (Vitest)            domain logic, validators, primitives math   fast, many
```

| Level | Tool | What it covers | Where | Runs |
|---|---|---|---|---|
| **Unit** | Vitest | Pure domain logic: credits, estimate, bucket order, AST validator, slot filling, edit classifier, motion math (`keyframes`, `tween`, `openClose`), theme parsing | `packages/*/src/**/*.test.ts` | Every commit |
| **Component** | Vitest + Testing Library | Web UI: chat widgets, estimate modal, live-steps pane, upload flow (API mocked with MSW) | `apps/web/**/*.test.tsx` | Every commit |
| **Contract** | Vitest + zod + MSW | API request/response schemas; SSE event schemas; queue payloads; **provider adapters against recorded real responses** (OpenRouter, ElevenLabs, Firecrawl, Dodo) | `packages/shared`, `apps/*/src/adapters/*.contract.test.ts` | Every commit |
| **Integration** | Vitest + Supertest + a throwaway `kinetiq_test` Postgres database (recreated from migrations per run) + Redis, via Docker Compose | API routes end to end with a real DB and queue: auth guard, IDOR, credits transactions, webhooks, idempotency, rate limits; worker graphs with fake providers | `apps/api/test/`, `apps/worker/test/` | Every PR |
| **Visual regression** | Remotion `renderStill` + pixelmatch | Every primitive and template renders the same keyframes as its approved baseline PNG (within a tolerance) | `packages/primitives/test/visual/`, `packages/renderer/test/visual/` | Every PR touching primitives or renderer |
| **LLM evals** | Custom runner + fixed set of "golden" sites | Director and scene coder quality: valid structure, allowlist pass rate, QA pass rate, text overflow, cost per video | `evals/` | Nightly on staging (real LLM, cost-capped) and before prompt changes |
| **E2E** | Playwright | Full user journeys in a browser against the local stack with `MOCK_PROVIDERS=true` and `RENDER_MODE=local` | `e2e/` | Every PR (smoke), nightly (full) |
| **Load** | k6 | Scalability NFRs | `infra/k6/` | Before launch and before big releases |
| **Security** | Integration tests + OWASP ZAP baseline + `npm audit` + `/security-review` | Auth, IDOR, webhook forgery, rate limits, sandbox escapes, headers | `apps/api/test/security/` | Every PR (tests); weekly (ZAP) |

## 4. Test data and fakes

| Fake / fixture | Behavior | Used by |
|---|---|---|
| `FakeLlm` | Returns scripted, schema-valid responses per prompt "role" (director, coder, qa). Can simulate invalid JSON, a refusal, a timeout. | Unit, integration, E2E, local dev |
| `FakeScraper` | Serves fixture sites from `fixtures/sites/*` (markdown + screenshots + brand) | Pipeline tests, E2E |
| `FakeVoice` | Returns a silent WAV with deterministic word timestamps | Audio and caption tests |
| `FakeVideoGen` | Returns a fixture clip after N simulated polls; can fail | aiClips tests |
| `LocalRender` | Real Remotion renderer running locally (stills and short MP4s) | Visual tests, E2E |
| `FakePayments` | Creates fake checkout URLs; a helper signs webhook payloads with the test secret | Billing tests |
| `MemoryStorage` | In-memory S3/R2 | Upload tests |
| `FixedClock`, `SeqId` | Controllable time and predictable ids | Everywhere |
| Factories | `makeUser()`, `makeProject()`, `withCredits(user, 100)` | Integration tests |
| Recorded responses | Real provider responses captured once (secrets removed), replayed with MSW | Contract tests |
| Malicious scene corpus | TSX samples that try `fetch`, `eval`, `import()`, prototype pollution, `window`, infinite loops | Validator and sandbox tests |

**Golden sites for evals:** 10 fixture startups (SaaS dashboard, dev tool, e-commerce, mobile app, AI tool, and others) with expected brand tokens. They are versioned in `fixtures/sites/`.

## 5. CI quality gates

GitHub Actions runs on every pull request. **Merging is blocked** unless every gate passes (NFR-MNT-03):

| Gate | Command | Threshold |
|---|---|---|
| Install + build | `pnpm i --frozen-lockfile && pnpm build` | Must pass |
| Typecheck | `pnpm typecheck` (strict TypeScript) | 0 errors |
| Lint | `pnpm lint` (ESLint incl. the no-`Date`/`Math.random` rule in the domain package, plus Prettier) | 0 errors |
| Unit + component + contract | `pnpm test` | 100% pass |
| Coverage | `pnpm test:coverage` (unit **and** integration tests, CI integration job) | **100% branches** for `domain/credits`, `domain/validator`, webhook handlers (NFR-MNT-04); **≥ 85%** for `packages/domain` overall; **≥ 90%** for `packages/shared`; **≥ 80%** for `packages/platform`; **≥ 70%** for API and worker |
| Integration | `pnpm test:int` (Compose Postgres + Redis) | 100% pass |
| Visual | `pnpm test:visual` (when primitives or renderer change) | Pixel diff ≤ 0.1% per baseline |
| E2E smoke | `pnpm e2e:smoke` | 100% pass |
| Prisma | `prisma migrate diff` / migrations apply cleanly | Must pass |
| Security | `pnpm audit --prod` (no high/critical); secret scan (gitleaks) | Must pass |

**Nightly:** the full E2E suite, LLM evals (cost-capped), and a ZAP baseline against staging.

## 6. Key test scenarios

### 6.1 Credits and billing (highest risk: money)
- Reserve succeeds when the balance is enough. Reserve fails with `402` and **no ledger rows** when it isn't.
- Two parallel `generate` calls with 1 job's worth of credits: exactly one succeeds (serializable transaction).
- Settle charges ≤ reserved and refunds the difference. A failed job refunds 100%. A cancel mid-way refunds the unused part.
- Buckets: subscription credits are spent before purchased ones, earliest expiry first. Expired buckets are skipped. The expiry cron writes `expire` entries.
- Invariant: `balance == SUM(ledger)` after every operation, and the balance is never negative except after a refund/chargeback clawback (FR-CRD-09). Property-based test with fast-check over random sequences.
- Dodo webhook: bad signature → `401` and nothing granted. Replayed event → granted once. Wrong amount → not granted, alert logged. Renewal → new subscription bucket.
- The success redirect page never changes the balance.

### 6.2 Pipeline
- Each node, run alone with fakes: correct state patch, emits `step.*` events.
- A node fails twice then succeeds: the job succeeds and earlier nodes are **not re-run** (checkpoint test counts FakeLlm calls).
- The QA loop stops after 2 rounds. Falling back to screenshots is triggered (FR-GEN-07).
- Output MP4: duration equals the requested duration ±0.5 s, resolution and fps are correct (checked with `ffprobe` on local renders).
- Edits: regenerating scene N re-runs only scene N. Other scenes' code is byte-identical. A new version is created.

### 6.3 Sandbox (scene code)
- Every sample in the malicious corpus is **rejected** by the validator. The corpus includes the escape tricks `({}).constructor.constructor('…')()`, `obj['con'+'structor']`, `__proto__` pollution, tagged templates, and string-built code (NFR-SEC-13).
- Render-page CSP: a scene that manages to call `fetch('https://evil.example')` has the request blocked (test in the local render harness) (NFR-SEC-12).
- Production config test: the API and worker containers have no code path that evaluates scene code (a static check plus a unit test on the `RenderPort` wiring in production mode).
- Valid samples using only primitives **pass** and render.
- Runtime guard: a scene that loops forever is killed by the render timeout and the job fails safely with a refund.

### 6.4 Security
- IDOR: user B's requests for user A's project, version, asset or job → `404`.
- Unauthenticated access to `/v1/*` (except the catalog) → `401`.
- Rate limits: the 11th auth request in a minute → `429` with `Retry-After`.
- Uploads: a wrong MIME type (a `.png` that is really HTML), an oversized file or a wrong key prefix → rejected.
- Headers: CSP, HSTS and CORS are present and correct (checked in integration tests).
- No secret-looking values in the web bundle (a build-time scan).
- CSRF: a `POST /v1/...` without the right `Origin` → `403`.
- Magic link: the 4th request for the same email within an hour → `429`. Responses are identical for known and unknown emails (FR-AUTH-06).
- Uploads: SVG, HTML and PDF are rejected even when renamed to `.png`. The client can't choose the object key. Content URLs are on the separate domain with `nosniff` and `attachment` headers (NFR-SEC-10).
- Idempotency: user B reusing user A's key gets their own fresh response, never A's (NFR-SEC-16).
- Logs: a request containing an email and token → the log line shows them redacted (NFR-SEC-15).
- Refund / chargeback webhook → credits clawed back; with a negative balance, `generate` → `402` (FR-CRD-09).
- Job deadline: a stuck fake provider → the job fails at the deadline and refunds (FR-GEN-11).

### 6.5 Realtime
- SSE: events arrive in order. A reconnect with `Last-Event-ID` replays missed events. The heartbeat keeps the connection alive through proxies.

### 6.6 Canvas and approvals
- Story set to manual: the job stops `waiting` after the director, `step.awaiting` is sent, no worker slot is held, and the deadline doesn't advance while it waits (FR-CANVAS-03, 09).
- Edit the storyboard → approve: the job resumes and finishes; research and designMd are **not** re-run (FakeLlm call counts).
- The invalidation map, table-driven: each gate change clears exactly its downstream nodes (FR-CANVAS-07); regenerating one scene leaves the other scenes' code byte-identical.
- An edit that doesn't fit the node's schema → `422`, nothing saved; scene code in an edit → rejected (FR-CANVAS-05).
- The regenerate note reaches the prompt fenced as the user's request, apart from site content; a note with "ignore previous instructions" changes nothing else (FR-CANVAS-06, NFR-SEC-07).
- The 6th regenerate of a gate → `429` (FR-CANVAS-08). Every regenerate adds provider-cost rows.
- Another user's job → `404` on every gates route; a replayed `Idempotency-Key` doesn't act twice (NFR-SEC-19).
- A job waiting 8 days → cancelled and refunded by the cleanup task (FR-CANVAS-10).
- "Auto all" → the job runs straight through, identical to the pre-canvas pipeline (the existing API → MP4 e2e passes unchanged).

### 6.7 Primitives and templates
- Motion math unit tests: `keyframes` clamps and interpolates, `openClose` reaches 1 and returns to 0, `cursorAt` follows the path.
- Visual baselines at chosen frames for every primitive and every template, for each ratio (16:9, 9:16, 1:1).
- Template text overflow: max-length strings fit in their slots (QA check and a visual test).

## 7. Traceability matrix

Every SRS requirement maps to at least one test. Test files follow `<area>/<requirement-id>.<level>.test.ts` where practical, so `grep FR-CRD-04` finds them.

| Requirement | Test level(s) | Test location (planned) |
|---|---|---|
| FR-AUTH-01, 05 | E2E, integration | `e2e/auth.spec.ts`, `apps/api/test/auth.int.test.ts` |
| FR-AUTH-02, 03 | Integration | `apps/api/test/security/cookies.int.test.ts`, `turnstile.int.test.ts` |
| FR-AUTH-04 | E2E | `e2e/draft-survives-login.spec.ts` |
| FR-AUTH-06, 07 | Integration | `apps/api/test/security/magic-link-limits.int.test.ts`, `admin-2fa.int.test.ts` |
| FR-PRJ-01, 02 | Contract, integration | `packages/shared/src/api/projects.test.ts`, `apps/api/test/projects.int.test.ts` |
| FR-PRJ-03 | Integration (IDOR) | `apps/api/test/security/idor.int.test.ts` |
| FR-PRJ-04, 05 | Integration | `apps/api/test/uploads.int.test.ts` |
| FR-PRJ-06 | Component | `apps/web/components/ChatBox.test.tsx` |
| FR-CHAT-01, 02, 03 | Integration, E2E | `apps/worker/test/setup-dialog.int.test.ts`, `e2e/setup-questions.spec.ts` |
| FR-CHAT-04 | Integration | `apps/api/test/idempotency.int.test.ts` |
| FR-GEN-01 | Unit, integration | `packages/domain/credits/estimate.test.ts` |
| FR-GEN-02, 10 | Integration, load | `apps/api/test/generate.int.test.ts`, `infra/k6/generate-burst.js` |
| FR-GEN-03, 04 | Integration | `apps/worker/test/generate-graph.int.test.ts` |
| FR-GEN-05 | Integration | `apps/worker/test/checkpoint-retry.int.test.ts` |
| FR-GEN-06 | Unit | `packages/domain/validator/allowlist.test.ts` (malicious corpus) |
| FR-GEN-07 | Integration | `apps/worker/test/screenshot-fallback.int.test.ts` |
| FR-GEN-08 | Integration (ffprobe) | `packages/renderer/test/output-spec.int.test.ts` |
| FR-GEN-09 | Integration | `apps/api/test/cancel.int.test.ts` |
| FR-GEN-11 | Integration | `apps/worker/test/job-deadline.int.test.ts` |
| FR-GEN-12 | Integration | `apps/worker/test/research-cache.int.test.ts` |
| FR-GEN-13 | Unit | `packages/domain/setup/state-machine.test.ts` (asserts zero LlmPort calls) |
| FR-CANVAS-01…12 | Unit, integration, E2E | `apps/worker/src/pipeline/gates.test.ts`, `apps/worker/src/pipeline/pipeline.int.test.ts` (gates), `apps/api/src/routes/gates.int.test.ts`, `e2e/canvas.spec.ts` |
| NFR-SEC-19 | Integration | `apps/api/src/routes/gates.int.test.ts` (IDOR, idempotency, schema) |
| FR-EDIT-01…05 | Unit, integration, E2E | `apps/worker/src/pipeline/gates.test.ts`, `apps/worker/test/edit-from-version.int.test.ts`, `e2e/canvas.spec.ts` |
| FR-AUD-01…03 | Unit, integration | `packages/domain/audio/timeline.test.ts`, `apps/worker/test/audio.int.test.ts` |
| FR-CRD-01 | Integration | `apps/api/test/webhooks/dodo.int.test.ts` |
| FR-CRD-02, 03 | Unit | `packages/domain/credits/buckets.test.ts` |
| FR-CRD-04 | Integration (concurrency) | `apps/api/test/credits-race.int.test.ts` |
| FR-CRD-05, 06 | Unit, integration | `packages/domain/credits/settle.test.ts` |
| FR-CRD-07 | Property-based | `packages/domain/credits/ledger.property.test.ts` |
| FR-CRD-08 | Integration | `apps/worker/test/cron-stale-reservations.int.test.ts` |
| FR-CRD-09 | Integration | `apps/api/test/webhooks/dodo-refund.int.test.ts` |
| FR-BILL-01…04 | Integration, E2E | `apps/api/test/billing.int.test.ts`, `e2e/buy-credits.spec.ts` |
| FR-TPL-01…04 | Unit, visual, E2E | `packages/domain/templates/fill.test.ts`, `packages/renderer/test/visual/templates.test.ts`, `e2e/use-template.spec.ts` |
| FR-ADM-01, 02 | Integration | `apps/api/test/admin.int.test.ts` |
| NFR-PERF-01 | Lighthouse CI | `infra/lighthouse.config.js` |
| NFR-PERF-02, NFR-SCALE-01…03 | Load | `infra/k6/*.js` |
| NFR-PERF-03 | LLM evals (staging) | `evals/time-to-video.ts` |
| NFR-REL-02, 03 | Integration (fault injection) | `apps/worker/test/provider-outage.int.test.ts` |
| NFR-SEC-01 | Build scan | `infra/scripts/scan-bundle-secrets.ts` |
| NFR-SEC-02…11, 15, 16 | Integration, security | `apps/api/test/security/*` |
| NFR-SEC-12, 13 | Unit, render harness | `packages/domain/validator/escapes.test.ts`, `packages/renderer/test/csp.int.test.ts` |
| NFR-SEC-14, 17 | Checklist + CI | Provider dashboards (release checklist); `.github/workflows/ci.yml` (SHA pins, audit) |
| NFR-SCALE-05…07 | Integration, config check | `apps/worker/test/checkpoint-prune.int.test.ts`, `infra/scripts/check-redis-policy.ts` |
| NFR-COST-04 | Integration | `apps/api/test/chat-llm-cap.int.test.ts` |
| NFR-COST-01, 03 | Integration | `apps/worker/test/cost-tracking.int.test.ts`, `kill-switch.int.test.ts` |
| NFR-MNT-01, 02 | E2E on fakes | `e2e/*` run with `MOCK_PROVIDERS=true` |
| NFR-MNT-03, 04 | CI | `.github/workflows/ci.yml` coverage gates |
| NFR-LEG-01 | Visual review + lint | `packages/primitives/test/no-trademarks.test.ts` (asset allowlist) |
| NFR-LEG-02 | Integration | `apps/api/test/delete-account.int.test.ts` |

## 8. Load test plan (k6)

| Scenario | Target | Pass criteria |
|---|---|---|
| Landing via CDN | 5k visits/hour for 1 h | CDN hit ratio ≥ 95%, zero origin errors |
| API reads | 200 req/s for 10 min (`/v1/me`, `/v1/projects`) | p95 ≤ 300 ms, errors < 0.1% |
| SSE | 1,000 concurrent connections for 15 min | No drops beyond reconnects, memory stable |
| Generate burst | 100 `generate` calls in 10 s (fake providers) | 0 errors; all queued; all finish; credits correct |

## 9. Release checklist

- [ ] All CI gates green on `main`
- [ ] Nightly E2E and LLM evals green, cost per video within target
- [ ] Load tests passed on staging for this release (if infrastructure changed)
- [ ] `/security-review` run on the release diff; findings fixed
- [ ] Migrations tested on a Neon branch copy of production
- [ ] Kill-switches verified on staging
- [ ] Every provider key has a hard spend cap; staging and prod keys are separate (NFR-SEC-14)
- [ ] AWS Lambda concurrency quota raised; `framesPerLambda` set (NFR-SCALE-05)
- [ ] Redis `maxmemory-policy noeviction` confirmed (NFR-SCALE-06)
- [ ] Rollback plan: previous Vercel/Railway deploy plus a backward-compatible migration

## 10. Bug policy

1. Reproduce the bug as a failing test (rule T8).
2. Fix it until the test passes.
3. Link the test to its SRS requirement. If no requirement covers the bug, **add one to the SRS**. A missing requirement is a documentation bug.

---
← [API](API.md) · **Next →** [TODO.md: Build Plan](TODO.md)
