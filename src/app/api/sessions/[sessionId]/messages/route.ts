import { NextResponse } from "next/server";

import { messageCreateSchema } from "@/lib/validators/generation";
import { getCurrentUser } from "@/server/auth/session";
import { enqueueJob } from "@/server/jobs/runner";
import {
  createMessageAndGeneration,
  getSessionById,
} from "@/server/services/sessions";

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { sessionId } = await context.params;
  const session = getSessionById(sessionId);

  if (!session || session.userId !== user.id) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = messageCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "消息参数不正确。" }, { status: 400 });
  }

  const created = createMessageAndGeneration({
    sessionId,
    content: parsed.data.content,
    mode: parsed.data.mode,
    parentGenerationId: parsed.data.parentGenerationId,
    keepSeed: parsed.data.keepSeed,
    outputMode: parsed.data.outputMode,
  });

  enqueueJob(created.jobId);

  return NextResponse.json({
    messageId: created.messageId,
    jobId: created.jobId,
    generationId: created.generationId,
    status: "queued",
    outputMode: parsed.data.outputMode,
  });
}
