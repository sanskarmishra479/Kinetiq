-- A project can have at most one queued or running job (FR-GEN-10).
-- A partial unique index makes this hold even when two requests race
-- (Prisma can't express partial indexes, so this is hand-written).
CREATE UNIQUE INDEX "job_one_active_per_project" ON "job" ("projectId") WHERE "status" IN ('queued', 'running');
