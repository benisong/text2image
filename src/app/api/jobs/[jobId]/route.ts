import { NextResponse } from "next/server";

import { withUser } from "@/lib/api-auth";
import { ROLE } from "@/lib/constants";
import { getJobById } from "@/server/services/sessions";

export const GET = withUser<{ jobId: string }>(async (ctx) => {
  const job = getJobById(ctx.params.jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (ctx.user.role !== ROLE.admin && job.userId !== ctx.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    errorMessage:
      job.status === "failed"
        ? job.publicErrorMessage ?? "生成失败，请稍后重试。"
        : null,
  });
});
