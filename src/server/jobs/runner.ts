import "server-only";

import { JOB_STATUS, OUTPUT_MODE } from "@/lib/constants";
import { buildCommentary } from "@/server/ai/commentary";
import { buildOptimizedPrompt } from "@/server/ai/prompt-optimizer";
import { generateImageWithVertex } from "@/server/ai/vertex-imagen";
import {
  getGenerationById,
  getJobById,
  markGenerationCompleted,
  markGenerationFailed,
  markGenerationProcessing,
  updateGenerationQueuedPayload,
  updateJobStatus,
} from "@/server/services/sessions";
import { getNumberSetting } from "@/server/services/settings";
import { saveGenerationImage } from "@/server/storage/images";

const globalForRunner = globalThis as typeof globalThis & {
  __text2imageRunnerState?: {
    activeCount: number;
    scheduled: boolean;
  };
};

function getRunnerState() {
  if (!globalForRunner.__text2imageRunnerState) {
    globalForRunner.__text2imageRunnerState = {
      activeCount: 0,
      scheduled: false,
    };
  }

  return globalForRunner.__text2imageRunnerState;
}

export function enqueueJob(jobId: string) {
  const state = getRunnerState();

  if (!state.scheduled) {
    state.scheduled = true;
    setTimeout(() => {
      state.scheduled = false;
      void processJobs([jobId]);
    }, 0);
  }
}

async function processJobs(jobIds: string[]) {
  const state = getRunnerState();
  const maxConcurrency = getNumberSetting("generation.max_concurrency", 2);

  for (const jobId of jobIds) {
    if (state.activeCount >= maxConcurrency) {
      return;
    }

    const job = getJobById(jobId);

    if (!job || job.status !== JOB_STATUS.waiting) {
      continue;
    }

    state.activeCount += 1;

    void runSingleJob(jobId).finally(() => {
      state.activeCount -= 1;
    });
  }
}

export async function runSingleJob(jobId: string) {
  const startedAt = new Date().toISOString();
  updateJobStatus({
    jobId,
    status: JOB_STATUS.active,
    progress: 10,
    startedAt,
  });

  const job = getJobById(jobId);

  if (!job) {
    return;
  }

  const generation = getGenerationById(job.generationId);

  if (!generation) {
    updateJobStatus({
      jobId,
      status: JOB_STATUS.failed,
      progress: 100,
      errorMessage: "generation not found",
      finishedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    markGenerationProcessing(generation.id);
    updateJobStatus({
      jobId,
      status: JOB_STATUS.active,
      progress: 25,
    });

    const parent = generation.parentGenerationId
      ? getGenerationById(generation.parentGenerationId)
      : null;

    const optimized = buildOptimizedPrompt({
      content: generation.originalPrompt,
      mode: parent ? "modify_last" : "new_image",
      keepSeed: generation.keepSeed,
      outputMode: generation.outputMode as
        | "image_only"
        | "image_with_commentary",
      parent: parent
        ? {
            effectivePrompt: parent.effectivePrompt,
            negativePrompt: parent.negativePrompt,
            seed: parent.seed,
            aspectRatio: parent.aspectRatio,
          }
        : null,
    });

    updateGenerationQueuedPayload({
      generationId: generation.id,
      effectivePrompt: optimized.prompt,
      negativePrompt: optimized.negativePrompt,
      promptJson: optimized,
      seed: optimized.seed,
      aspectRatio: optimized.aspectRatio,
      explanationStatus:
        optimized.outputMode === OUTPUT_MODE.imageWithCommentary ? "queued" : "none",
    });

    updateJobStatus({
      jobId,
      status: JOB_STATUS.active,
      progress: 50,
    });

    const result = await generateImageWithVertex({
      prompt: optimized.prompt,
      negativePrompt: optimized.negativePrompt,
      aspectRatio: optimized.aspectRatio,
      seed: optimized.seed,
    });

    const stored = saveGenerationImage({
      sessionId: generation.sessionId,
      generationId: generation.id,
      mimeType: result.mimeType,
      bytes: result.bytes,
    });

    let explanationText: string | null = null;
    let explanationStatus = "none";

    if (generation.outputMode === OUTPUT_MODE.imageWithCommentary) {
      explanationText = buildCommentary({
        originalPrompt: generation.originalPrompt,
        effectivePrompt: result.effectivePrompt,
        keepSeed: generation.keepSeed,
        parentExists: Boolean(parent),
      });
      explanationStatus = "completed";
    }

    markGenerationCompleted({
      generationId: generation.id,
      mimeType: result.mimeType,
      effectivePrompt: result.effectivePrompt,
      publicUrl: stored.publicUrl,
      storagePath: stored.absolutePath,
      fileSizeBytes: stored.fileSizeBytes,
      explanationText,
      explanationStatus,
    });

    updateJobStatus({
      jobId,
      status: JOB_STATUS.completed,
      progress: 100,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown job error";

    markGenerationFailed(generation.id, message);
    updateJobStatus({
      jobId,
      status: JOB_STATUS.failed,
      progress: 100,
      errorMessage: message,
      finishedAt: new Date().toISOString(),
    });
  }
}
