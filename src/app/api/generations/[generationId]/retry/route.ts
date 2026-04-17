import { NextResponse } from "next/server";

import { withUser } from "@/lib/api-auth";
import { enqueueJob } from "@/server/jobs/runner";
import { recordAudit } from "@/server/services/audit";
import {
  RetryGenerationError,
  retryFailedGeneration,
} from "@/server/services/sessions";

export const POST = withUser<{ generationId: string }>(async (ctx) => {
  try {
    const result = retryFailedGeneration({
      generationId: ctx.params.generationId,
      userId: ctx.user.id,
    });

    enqueueJob(result.jobId);

    recordAudit({
      action: "generation.retried",
      actorId: ctx.user.id,
      actorUsername: ctx.user.username,
      targetType: "generation",
      targetId: ctx.params.generationId,
      metadata: { sessionId: result.sessionId },
      ip: ctx.ip,
    });

    return NextResponse.json({ ok: true, jobId: result.jobId });
  } catch (error) {
    if (error instanceof RetryGenerationError) {
      if (error.reason === "not_found") {
        return NextResponse.json(
          { error: "任务不存在。" },
          { status: 404 },
        );
      }
      if (error.reason === "forbidden") {
        return NextResponse.json(
          { error: "无权重试该任务。" },
          { status: 403 },
        );
      }
      return NextResponse.json(
        { error: "仅失败的任务可以重试。" },
        { status: 400 },
      );
    }
    throw error;
  }
});
