import { NextResponse } from "next/server";

import { withUser } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/http";
import { messageCreateSchema } from "@/lib/validators/generation";
import { enqueueJob } from "@/server/jobs/runner";
import {
  CreateMessageError,
  MESSAGES_PAGE_SIZE,
  createMessageAndGeneration,
  getMessagesForSession,
  getSessionById,
} from "@/server/services/sessions";

export const GET = withUser<{ sessionId: string }>(async (ctx) => {
  const session = getSessionById(ctx.params.sessionId);

  if (!session || session.userId !== ctx.user.id) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }

  const url = new URL(ctx.request.url);
  const before = url.searchParams.get("before") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam
    ? Math.min(Math.max(Number(limitParam) || MESSAGES_PAGE_SIZE, 1), 200)
    : MESSAGES_PAGE_SIZE;

  return NextResponse.json(
    getMessagesForSession(ctx.params.sessionId, { before, limit }),
  );
});

export const POST = withUser<{ sessionId: string }>(async (ctx) => {
  const session = getSessionById(ctx.params.sessionId);

  if (!session || session.userId !== ctx.user.id) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }

  const body = await readJsonBody(ctx.request);

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
      sessionId: ctx.params.sessionId,
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
});
