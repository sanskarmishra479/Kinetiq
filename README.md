# Kinetiq

**URL to video.** Paste a startup's URL and get a motion-designer-quality launch video.

📚 Full documentation lives in [`docs/`](docs/README.md). Read it in order: README → PRD → SRS → ARCHITECTURE → API → TEST_PLAN → TODO.

## Quick start (local, zero cost)

Requirements: Node 24+, pnpm 12+, Docker.

```bash
pnpm install
cp .env.example .env      # local defaults: fake AI providers, local rendering
pnpm infra:up             # Postgres, Redis, MinIO (S3) in Docker
pnpm test                 # unit tests
pnpm test:int             # integration tests (needs infra:up)
pnpm check                # everything CI checks: lint, format, types, tests + coverage
```

`pnpm infra:down` stops the services.

## Layout

| Path                  | What                                                        |
| --------------------- | ----------------------------------------------------------- |
| `apps/api`            | Express API                                                 |
| `apps/worker`         | BullMQ worker + AI pipeline                                 |
| `packages/shared`     | zod contracts + typed config                                |
| `packages/domain`     | Pure business logic + ports (fully unit-tested)             |
| `packages/db`         | Prisma schema + repositories                                |
| `packages/renderer`   | Remotion renderer (dynamic scene runtime)                   |
| `packages/primitives` | Motion primitives library (Remotion): Cursor, Camera, Lens… |
| `infra/`              | Docker Compose for local services                           |
| `docs/`               | Product and engineering docs                                |

## Rules

- **Tests ship with every change.** See [docs/TEST_PLAN.md](docs/TEST_PLAN.md) §2.
- **Never commit secrets.** `.env` is git-ignored; production secrets live in the hosting dashboards.
- **Docs change with the code.**
