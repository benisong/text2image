import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/http";
import { messageCreateSchema } from "@/lib/validators/generation";
import { getCurrentUser } from "@/server/auth/session";
import { enqueueJob } from "@/server/jobs/runner";
import {
  CreateMessageError,
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

  const body = await readJsonBody(request);

  if (body === null) {
    return NextResponse.json(
      { error: "请求体不是合法的 JSON。" },
      { status: 400 },
    );
  }

  const parsed = messageCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "消息参数不正确。" }, { status: 400 });
  }

  try {
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
  } catch (error) {
    if (error instanceof CreateMessageError) {
      return NextResponse.json(
        { error: "引用的上一张图不属于当前会话。" },
        { status: 400 },
      );
    }

    throw error;
  }
}
