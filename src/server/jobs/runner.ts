import "server-only";

import { JOB_STATUS, OUTPUT_MODE } from "@/lib/constants";
import { nowIso } from "@/lib/utils";
import { buildCommentary } from "@/server/ai/commentary";
import {
  generateImage,
  ImageGenerationError,
} from "@/server/ai/image-generator";
import { buildOptimizedPrompt } from "@/server/ai/prompt-optimizer";
import { optimizePromptWithLlm } from "@/server/ai/prompt-llm";
import { getDb } from "@/server/db";
import {
  getGenerationById,
  getJobById,
  listPendingJobs,
  markGenerationCompleted,
  markGenerationFailed,
  markGenerationProcessing,
  updateGenerationQueuedPayload,
  updateJobStatus,
} from "@/server/services/sessions";
import { getNumberSetting } from "@/server/services/settings";
import { saveGenerationImage } from "@/server/storage/images";

type RunnerState = {
  activeCount: number;
  draining: boolean;
  recovered: boolean;
};

const globalForRunner = globalThis as typeof globalThis & {
  __text2imageRunnerState?: RunnerState;
};

function getRunnerState(): RunnerState {
  if (!globalForRunner.__text2imageRunnerState) {
    globalForRunner.__text2imageRunnerState = {
      activeCount: 0,
      draining: false,
      recovered: false,
    };
  }

  return globalForRunner.__text2imageRunnerState;
}

function recoverOrphanedJobs() {
  const state = getRunnerState();

  if (state.recovered) {
    return;
  }

  state.recovered = true;

  const now = nowIso();
  getDb()
    .prepare(
      `UPDATE jobs SET status = ?, updated_at = ?, started_at = NULL
       WHERE status = ?`,
    )
    .run(JOB_STATUS.waiting, now, JOB_STATUS.active);
}

function claimNextWaitingJob(): string | null {
  const db = getDb();
  const now = nowIso();

  const claim = db.transaction((): string | null => {
    const pending = db
      .prepare(
        `SELECT id FROM jobs WHERE status = ? ORDER BY created_at ASC LIMIT 1`,
      )
      .get(JOB_STATUS.waiting) as { id: string } | undefined;

    if (!pending) {
      return null;
    }

    db.prepare(
      `UPDATE jobs SET status = ?, updated_at = ?, started_at = COALESCE(started_at, ?)
       WHERE id = ? AND status = ?`,
    ).run(JOB_STATUS.active, now, now, pending.id, JOB_STATUS.waiting);

    return pending.id;
  });

  return claim();
}

function scheduleProcessing() {
  const state = getRunnerState();

  if (state.draining) {
    return;
  }

  state.draining = true;

  setTimeout(() => {
    state.draining = false;
    void drainQueue();
  }, 0);
}

async function drainQueue() {
  const state = getRunnerState();
  const maxConcurrency = getNumberSetting("generation.max_concurrency", 2);

  while (state.activeCount < maxConcurrency) {
    const jobId = claimNextWaitingJob();

    if (!jobId) {
      return;
    }

    state.activeCount += 1;

    void runSingleJob(jobId).finally(() => {
      state.activeCount -= 1;
      scheduleProcessing();
    });
  }
}

export function enqueueJob(jobId: string) {
  void jobId;
  recoverOrphanedJobs();
  scheduleProcessing();
}

export function recoverPendingJobsOnStartup() {
  recoverOrphanedJobs();

  const pending = listPendingJobs();
  if (pending.length > 0) {
    scheduleProcessing();
  }
}

export async function runSingleJob(jobId: string) {
  updateJobStatus({
    jobId,
    status: JOB_STATUS.active,
    progress: 10,
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

    const baseline = buildOptimizedPrompt({
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

    // 若管理端配置了 chat 模型，先用 LLM 把自然语言改写成英文图像 prompt。
    // 失败 / 未配置时静默回落到模板产物，不阻塞生图。
    const llm = await optimizePromptWithLlm({
      originalPrompt: generation.originalPrompt,
      mode: parent ? "modify_last" : "new_image",
      parentPrompt: parent?.effectivePrompt ?? null,
    });

    const optimized = llm
      ? {
          ...baseline,
          prompt: llm.prompt,
          promptSource: "llm" as const,
          optimizerModel: llm.model,
        }
      : { ...baseline, promptSource: "template" as const };

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

    const result = await generateImage({
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
    const internalMessage =
      error instanceof Error ? error.message : "Unknown job error";
    const publicMessage =
      error instanceof ImageGenerationError
        ? error.publicMessage
        : "生成失败，请稍后重试。";

    markGenerationFailed(generation.id, internalMessage, publicMessage);
    updateJobStatus({
      jobId,
      status: JOB_STATUS.failed,
      progress: 100,
      errorMessage: internalMessage,
      publicErrorMessage: publicMessage,
      finishedAt: new Date().toISOString(),
    });
  }
}
