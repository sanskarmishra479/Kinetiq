# Kinetiq Documentation

> **Kinetiq** (kinetiq.so): *URL to video.* Paste a startup's URL and get a motion-designer-quality launch video.

This folder is the single source of truth for **what** we are building, **why**, and **how**. The docs are meant to be read in order. Each one builds on the previous one, and each ends with a link to the next.

## Reading order

```
 README.md ──► PRD.md ──► SRS.md ──► ARCHITECTURE.md ──► API.md ──► TEST_PLAN.md ──► TODO.md
 (start here)  (why/what)  (exact     (how the system    (every      (how we prove     (what to
                           rules)     is built)          endpoint)   it works)          build next)
```

| # | Document | Answers | Read it when |
|---|---|---|---|
| 0 | [README.md](README.md) | Where do I start? | Always first |
| 1 | [PRD.md](PRD.md) | **Why** are we building this, for **whom**, and **what** does it do? | Before any product decision |
| 2 | [SRS.md](SRS.md) | What are the **exact, testable requirements** (FR-xx, NFR-xx)? | Before writing any feature |
| 3 | [ARCHITECTURE.md](ARCHITECTURE.md) | **How** is the system built, and how does it scale from 5k to 100k visitors? | Before touching infrastructure or adding a service |
| 4 | [API.md](API.md) | What does every endpoint, event, webhook and queue look like? | Before writing or calling an endpoint |
| 5 | [TEST_PLAN.md](TEST_PLAN.md) | How do we **prove** every requirement works and keep it from breaking? | Before merging any code |
| 6 | [TODO.md](TODO.md) | What do we build next, in which order? (Backend first, then a minimal frontend) | Every working session |

## How the docs connect

- The **PRD** defines features, like "users can edit the video by chat".
- The **SRS** turns each feature into numbered, testable requirements. For example, `FR-EDIT-02` says "an edit only re-renders affected scenes".
- **ARCHITECTURE** shows which component implements each requirement.
- **API** shows the exact contract (request/response) for each requirement.
- The **TEST_PLAN** maps every requirement ID to the tests that prove it (the traceability matrix).

**Rule:** a feature isn't done until its SRS requirement has a passing test listed in the TEST_PLAN.

## Other important files

| File | What it is |
|---|---|
| [`../what-i-want.md`](../what-i-want.md) | The founder's original vision and running decision log |
| [`../primitives/`](../primitives/) | The motion primitives library (Remotion): Cursor, Camera, Lens… |
| [`../image.png`](../image.png) | UI reference for the project page (chat on the left, live preview on the right) |

## Golden rules for everyone (humans and AI)

1. **Testable first.** Every module is written so it can be tested without real APIs, real money or a real clock. See [TEST_PLAN.md § Testability rules](TEST_PLAN.md#2-testability-rules-how-we-write-code).
2. **No money without a webhook.** Credits are granted only by a verified Dodo Payments webhook.
3. **Secrets never reach the browser.** Only the API and worker talk to AI providers.
4. **Queue everything slow.** Nothing expensive runs inside an HTTP request.
5. **Docs change with the code.** If a requirement, endpoint or architecture decision changes, update the matching doc in the same pull request.

---
**Next →** [PRD.md: Product Requirements](PRD.md)
