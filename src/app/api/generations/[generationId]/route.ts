import { NextResponse } from "next/server";

import { ROLE } from "@/lib/constants";
import { getCurrentUser } from "@/server/auth/session";
import { getGenerationById, getSessionById } from "@/server/services/sessions";

export async function GET(
  _request: Request,
  context: { params: Promise<{ generationId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { generationId } = await context.params;
  const generation = getGenerationById(generationId);

  if (!generation) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }

  const session = getSessionById(generation.sessionId);

  if (!session || (user.role !== ROLE.admin && session.userId !== user.id)) {
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
  });
}
