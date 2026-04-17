import { NextResponse } from "next/server";

import { withUser } from "@/lib/api-auth";
import { ROLE } from "@/lib/constants";
import { getGenerationById, getSessionById } from "@/server/services/sessions";

export const GET = withUser<{ generationId: string }>(async (ctx) => {
  const generation = getGenerationById(ctx.params.generationId);

  if (!generation) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }

  const session = getSessionById(generation.sessionId);

  if (!session || (ctx.user.role !== ROLE.admin && session.userId !== ctx.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    id: generation.id,
    status: generation.status,
    publicUrl: generation.publicUrl,
    effectivePrompt: generation.effectivePrompt,
    negativePrompt: generation.negativePrompt,
    seed: generation.seed,
    aspectRatio: generation.aspectRatio,
    outputMode: generation.outputMode,
    explanationText: generation.explanationText,
    errorMessage:
      generation.status === "failed"
        ? generation.publicErrorMessage ?? "生成失败，请稍后重试。"
        : null,
  });
});
