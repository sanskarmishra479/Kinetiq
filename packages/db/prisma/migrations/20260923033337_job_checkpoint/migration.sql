-- CreateTable
CREATE TABLE "job_checkpoint" (
    "jobId" TEXT NOT NULL,
    "node" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_checkpoint_pkey" PRIMARY KEY ("jobId")
);

-- AddForeignKey
ALTER TABLE "job_checkpoint" ADD CONSTRAINT "job_checkpoint_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
