# API: API Reference

**Kinetiq** · **Base URL:** `https://api.kinetiq.so` · **Version:** `v1` · **Last updated:** 2026-09-21

← [ARCHITECTURE](ARCHITECTURE.md) · **API** · [TEST_PLAN →](TEST_PLAN.md)

---

Every request and response shape below is defined **once**, as a zod schema in `packages/shared/src/api/`. The API validates against it, and the web app uses the inferred types. The `[FR-…]` tags link endpoints to requirements in [SRS.md](SRS.md).

## 1. Conventions

| Topic | Rule |
|---|---|
| Format | JSON (`Content-Type: application/json`), UTF-8. Times are ISO-8601 UTC. |
| Auth | Session cookie from BetterAuth (`.kinetiq.so`, httpOnly). Requests need `credentials: 'include'`. |
| CORS | Only `https://kinetiq.so` (plus preview URLs on staging). |
| IDs | Prefixed and opaque: `prj_…`, `job_…`, `ver_…`, `ast_…`, `tpl_…`. |
| Pagination | Cursor based: `?limit=20&cursor=…` → `{ items, nextCursor }`. |
| Idempotency | `POST` endpoints that start jobs or touch money **require** an `Idempotency-Key` header (UUID). A repeat returns the same response for 24 h. Keys are **scoped per user** (NFR-SEC-16). |
| CSRF | Every `POST`/`PUT`/`PATCH`/`DELETE` under `/v1` must send `Origin: https://kinetiq.so`, or it gets `403 FORBIDDEN` (NFR-SEC-11). Webhooks are exempt and use signatures. |
| File URLs | User files and renders are served from `kinetiqcontent.com` through short-lived signed URLs, never from `*.kinetiq.so` (NFR-SEC-10). |
| Credits | Always integers. |
| Rate limits | Headers `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`. A `429` includes `Retry-After`. |
| Tracing | Every response carries `X-Request-Id`. |

### Error format
```json
{
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "You need 23 credits but have 10.",
    "details": { "required": 23, "available": 10 },
    "requestId": "req_8f2c..."
  }
}
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod failure; `details.fields` holds per-field messages |
| 401 | `UNAUTHENTICATED` | No or expired session |
| 402 | `INSUFFICIENT_CREDITS` | Can't reserve credits |
| 403 | `FORBIDDEN` | Plan doesn't allow the feature (e.g. AI clips on Go) |
| 404 | `NOT_FOUND` | Missing, **or belongs to another user** (never leaks existence) |
| 409 | `CONFLICT` | Job already running for this project; version conflict |
| 409 | `IDEMPOTENCY_MISMATCH` | Same key reused with a different body |
| 413 | `PAYLOAD_TOO_LARGE` | Body or upload too large |
| 429 | `RATE_LIMITED` / `CONCURRENCY_LIMIT` | Too many requests / too many running jobs |
| 503 | `DEGRADED` | Kill-switch active or provider outage; the client should retry later |

## 2. Auth (BetterAuth): `/api/auth/*` [FR-AUTH-01…05]

BetterAuth handles these. Main routes the web app uses:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/sign-in/magic-link` | `{ email, callbackURL, turnstileToken }` → sends a magic link |
| GET | `/api/auth/magic-link/verify?token=…` | Verifies, sets the session cookie, redirects |
| POST | `/api/auth/sign-in/social` | `{ provider: "google", callbackURL }` → OAuth redirect URL |
| GET | `/api/auth/get-session` | The current session or `null` |
| POST | `/api/auth/sign-out` | Invalidates the session |

## 3. Account

### `GET /v1/me`
```json
{
  "user": { "id": "usr_1", "email": "a@b.com", "name": "Asha", "image": null },
  "plan": { "code": "go", "status": "active", "currentPeriodEnd": "2026-10-21T00:00:00Z" },
  "credits": {
    "total": 140,
    "buckets": [
      { "id": "bkt_1", "source": "subscription", "remaining": 90, "expiresAt": "2026-10-21T00:00:00Z" },
      { "id": "bkt_2", "source": "purchase", "remaining": 50, "expiresAt": null }
    ],
    "reserved": 0
  },
  "limits": { "concurrentJobs": 1, "dailyJobs": 10, "aiClips": false }
}
```

### `DELETE /v1/me` [NFR-LEG-02]
Deletes the account and all its data (projects, assets, renders). The body must be exactly `{"confirm": true}`, otherwise `400`. Returns `204` and expires the session cookies.

## 4. Projects [FR-PRJ-01…05]

### `POST /v1/projects`
```json
// request
{
  "url": "https://acme.com",
  "durationSec": 30,
  "ratio": "16:9",
  "model": null,
  "templateId": null,
  "assetIds": ["ast_1", "ast_2"],
  "prompt": "Focus on the AI search feature"
}
// 201
{ "project": { "id": "prj_1", "status": "setup", "url": "https://acme.com", "durationSec": 30, "ratio": "16:9", "createdAt": "..." } }
```
- Validation: `url` is https and ≤ 2,048 chars; `durationSec ∈ {15,30,45}`; `ratio ∈ {"16:9","9:16","1:1"}`; `model` is optional (AI clips are post-MVP) and must be in the registry when set; at most 10 `assetIds`, each owned by the user and in status `ready`.
- The project starts in status `setup`. The AI asks the setup questions ([§ 5](#5-chat-fr-chat-0104)).

### `GET /v1/projects?limit=20&cursor=…`
→ `{ items: Project[], nextCursor }`, newest first.

### `GET /v1/projects/:id`
→ `{ project, latestVersion?, activeJob? }`

### `DELETE /v1/projects/:id`
→ `204`. Cancels running jobs (with refunds) and deletes the project's assets and renders.

## 5. Chat [FR-CHAT-01…04]

### `GET /v1/projects/:id/messages?limit=50&cursor=…`
```json
{ "items": [
  { "id": "msg_1", "role": "assistant", "content": "Want a voiceover?",
    "ui": { "type": "choice", "key": "voiceover", "options": ["yes", "no"] }, "createdAt": "..." },
  { "id": "msg_2", "role": "user", "content": "yes", "createdAt": "..." }
], "nextCursor": null }
```
`ui` renders interactive widgets: `choice`, `voicePicker`, `designPicker`, `estimate`.

### `POST /v1/projects/:id/messages` (requires `Idempotency-Key`)
```json
// request
{ "content": "Make the intro faster", "answer": { "key": "voiceover", "value": "yes" } }
// 201
{ "message": { "id": "msg_3", "role": "user", "...": "..." }, "jobId": "job_9" }
```
- During `setup`, answers update the project settings (voice, design style). The assistant replies arrive over SSE.
- After a version exists, free text is treated as an **edit** and may start an `edit` job (`jobId` is set) [FR-EDIT-01].

## 6. Generation and jobs [FR-GEN-01…10, FR-CRD-04…06]

### `POST /v1/projects/:id/estimate`
```json
// 200
{ "credits": 23, "breakdown": [
    { "item": "video_30s", "credits": 20 },
    { "item": "voiceover", "credits": 3 }
  ], "balance": 140, "canAfford": true }
```
Uses the same pure function (`domain/credits/estimate`) as the server-side reservation, so the estimate and the reserved amount can never differ.

### `POST /v1/projects/:id/generate` (requires `Idempotency-Key`)
```json
// 202
{ "job": { "id": "job_1", "type": "generate", "status": "queued", "reservedCredits": 23, "queuePosition": 2 } }
```
Errors: `402 INSUFFICIENT_CREDITS`, `409 CONFLICT` (a job is already running for this project), `429 CONCURRENCY_LIMIT`, `503 DEGRADED`.

### `GET /v1/jobs/:id`
```json
{ "job": { "id": "job_1", "status": "running", "type": "generate",
  "steps": [
    { "node": "research", "status": "done", "startedAt": "...", "endedAt": "..." },
    { "node": "sceneCoder", "status": "running", "progress": { "done": 2, "total": 5 } }
  ],
  "reservedCredits": 23, "chargedCredits": null, "versionId": null, "error": null } }
```
Job `status`: `queued | running | succeeded | failed | cancelled`.

### `POST /v1/jobs/:id/cancel`
→ `200 { job }` with `status: "cancelled"`. Unused credits are refunded [FR-GEN-09].

## 7. Versions [FR-EDIT-03, FR-EDIT-04]

| Method | Path | Response |
|---|---|---|
| GET | `/v1/projects/:id/versions` | `{ items: [{ id, number, createdAt, posterUrl, durationSec, parentVersionId }] }` |
| POST | `/v1/versions/:id/restore` | `201 { version }`: a new version that copies the old one |
| GET | `/v1/versions/:id/download` | `{ url, expiresAt }`: signed R2 URL, valid 10 min |
| GET | `/v1/versions/:id/stream` | `{ url, expiresAt }`: signed URL for the in-app player |

## 8. Realtime events (SSE)

### `GET /v1/projects/:id/events`
- Content type `text/event-stream`. The server sends a heartbeat comment every 15 s.
- To resume after a disconnect, the client sends `Last-Event-ID`. The server replays the last 100 events from Redis.
- Every event `data` is a zod-validated JSON `ProjectEvent` from `packages/shared/src/events.ts`.

| `event:` | `data` example | Meaning |
|---|---|---|
| `job.queued` | `{ "jobId": "job_1", "position": 2 }` | Waiting in the queue |
| `step.started` | `{ "jobId": "job_1", "node": "research" }` | Step began |
| `step.progress` | `{ "jobId": "job_1", "node": "sceneCoder", "done": 2, "total": 5, "thumbUrl": "..." }` | Partial progress with a thumbnail |
| `step.done` | `{ "jobId": "job_1", "node": "designMd", "summary": "Dark theme, violet accent" }` | Step finished |
| `step.failed` | `{ "jobId": "job_1", "node": "aiClips", "retrying": true, "attempt": 2 }` | Failure; may retry |
| `message.created` | `{ "message": { ... } }` | New assistant chat message |
| `version.ready` | `{ "versionId": "ver_2", "number": 2, "posterUrl": "..." }` | The video is ready |
| `job.finished` | `{ "jobId": "job_1", "status": "succeeded", "chargedCredits": 21, "refunded": 2 }` | Final state and credits |
| `credits.updated` | `{ "total": 119 }` | Balance changed |

## 9. Uploads [FR-PRJ-04, FR-PRJ-05]

### `POST /v1/uploads`
Allowed: `image/png`, `image/jpeg`, `image/webp` (≤ 10 MB); `video/mp4`, `video/webm` (≤ 100 MB, ≤ 2 min, checked with ffprobe). Anything else, **including SVG and HTML**, gets `400`. The server generates the object key; the client never chooses it.
```json
// request
{ "filename": "dashboard.png", "mime": "image/png", "size": 482133, "kind": "screenshot" }
// 201
{ "assetId": "ast_1", "upload": { "method": "PUT", "url": "https://<r2-endpoint>/kinetiq-content/u/usr_1/ast_1?X-Amz-Signature=...", "headers": { "content-type": "image/png" } }, "expiresAt": "..." }
```
The presigned PUT signs the `Content-Type` (R2 has no presigned POST), and the server picks the key. The browser uploads straight to R2 with exactly the returned method, URL and headers.

### `POST /v1/uploads/:assetId/complete`
The server runs a HEAD request on the object and checks the real size and the file's first bytes (magic bytes). Images and DESIGN.md files become `ready`; videos become `processing` until the worker's ffprobe check. Anything that doesn't match is deleted, marked `rejected`, and the call returns `400`. Completing twice is harmless.

## 10. Catalog (public, cached at the CDN)

| Method | Path | Cache | Response |
|---|---|---|---|
| GET | `/v1/templates` | 5 min | `{ items: [{ id, slug, title, previewUrl, posterUrl, ratios, durations, creditDiscountPct }] }` |
| GET | `/v1/templates/:slug` | 5 min | `{ template, slots: [{ key, type, maxChars? }] }` |
| GET | `/v1/voices` | 1 h | `{ items: [{ id: "sam", name: "Sam", traits: "confident, fast, male", previewUrl, languages }] }` (5 voices) |
| GET | `/v1/design-presets` | 1 h | `{ items: [{ id: "dark-cinematic", name: "Dark cinematic", description, swatch }] }` |
| GET | `/v1/billing/plans` | 5 min | `{ plans: [...], packs: [...] }` (prices TBD) |

## 11. Brand kits [FR-CHAT-02]

### `POST /v1/brand-kits`
```json
// request (paste)            // or: { "assetId": "ast_7" } for an uploaded .md file
{ "designMd": "# Brand\nPrimary: #16a34a\nFont: Inter\n..." }
// 201
{ "brandKit": { "id": "bk_1", "tokens": { "accent": "#16a34a", "bg": "#ffffff", "font": "Inter" } } }
```
The content is limited to 20 KB, parsed and validated into theme tokens. "Import from website" happens inside the pipeline (`designMd` node).

## 12. Billing [FR-BILL-01…03]

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/billing/checkout` | `Idempotency-Key` required. `{ "planCode": "go" }` or `{ "packCode": "pack_60" }` → `{ "checkoutUrl" }` |
| POST | `/v1/billing/portal` | → `{ "portalUrl" }` to manage or cancel a subscription |
| GET | `/v1/billing/ledger?limit=50&cursor=…` | `{ items: [{ id, type, amount, bucketId, jobId, createdAt }] }` |

## 13. Webhooks (server to server)

All webhooks share these rules:
- Read the **raw body**, verify the signature, and reject with `401` if it fails.
- **Deduplicate** on `(provider, eventId)` in `WebhookEvent`, and return `200` for duplicates.
- Process inside a transaction, and respond within 5 s. Heavy work is enqueued.

| Method | Path | Source | Handles |
|---|---|---|---|
| POST | `/v1/webhooks/dodo` | Dodo Payments (Standard Webhooks signature) | `payment.succeeded` → purchase bucket; `subscription.active` / `renewed` → subscription bucket; `subscription.cancelled` / `failed` → update status; `refund.succeeded` → claw back unspent credits |
| POST | `/v1/webhooks/render` | Remotion Lambda (webhook secret) | Render progress, success, error → resume the job |
| POST | `/v1/webhooks/video/:token` | OpenRouter video `callback_url` | Clip completed → resume the `aiClips` node. `:token` is a single-use HMAC over `jobId + clipId` |

Amounts from Dodo are checked against the server-side price table. If they don't match, the event is logged and **no credits are granted**.

## 14. Admin (`/v1/admin/*`, admin role only) [FR-ADM-01, FR-ADM-02]

| Method | Path | Purpose |
|---|---|---|
| GET/PUT | `/v1/admin/flags/:key` | Kill-switches: `pause_ai_clips`, `pause_new_jobs`, `force_fallback_model` |
| POST | `/v1/admin/templates/:id/publish` | Publish or unpublish a template |
| GET | `/v1/admin/costs?from=&to=` | Spend per provider, margin per video |

## 15. Health

| Path | Meaning |
|---|---|
| `GET /healthz` | Process is alive (no dependencies checked) |
| `GET /readyz` | DB and Redis are reachable; used by the load balancer |

## 16. Internal queues (worker contracts)

Payloads are zod schemas in `packages/shared/src/queues.ts`. The API and worker share them.

| Queue | Payload | Producer | Retries | Notes |
|---|---|---|---|---|
| `generate` | `{ jobId, projectId, userId }` | API | 3, exponential | Runs the LangGraph generate graph from its checkpoint |
| `edit` | `{ jobId, projectId, userId, messageId }` | API | 3 | Edit graph |
| `render` | `{ jobId, kind: "still" \| "final", versionId, inputPropsKey }` | Worker | 2 | Remotion Lambda |
| `media-poll` | `{ jobId, clipId, providerJobId }` | Worker | backoff up to 20 min | Fallback when the video callback doesn't arrive |
| `email` | `{ to, template, data }` | API / Worker | 5 | Resend |
| `cron` | repeatable | scheduler | n/a | Expire stale reservations (every 2 h), expire subscription buckets (hourly), clean orphaned uploads (daily), reconcile Dodo subscriptions (daily) |

## 17. Rate limits (defaults; set through config)

| Scope | Limit |
|---|---|
| `/api/auth/*` per IP | 10 / min |
| `/v1/*` per user | 120 / min |
| `/v1/*` per IP (anonymous catalog) | 300 / min (mostly served by the CDN) |
| `POST /generate` per user | 10 / hour and plan concurrency (Go 1, Pro 3) |
| `POST /uploads` per user | 30 / hour |
| SSE connections per user | 5 |

---
← [ARCHITECTURE](ARCHITECTURE.md) · **Next →** [TEST_PLAN.md: Test Plan](TEST_PLAN.md)
