import { NextResponse } from "next/server";

import { withUser } from "@/lib/api-auth";
import { recordAudit } from "@/server/services/audit";
import {
  deleteSessionWithAssets,
  getMessagesForSession,
  getSessionById,
} from "@/server/services/sessions";

export const GET = withUser<{ sessionId: string }>(async (ctx) => {
  const session = getSessionById(ctx.params.sessionId);

  if (!session || session.userId !== ctx.user.id) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }

  return NextResponse.json({
    session,
    ...getMessagesForSession(ctx.params.sessionId),
  });
});

export const DELETE = withUser<{ sessionId: string }>(async (ctx) => {
  const session = getSessionById(ctx.params.sessionId);

  if (!session || session.userId !== ctx.user.id) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }

  deleteSessionWithAssets(ctx.params.sessionId);

  recordAudit({
    action: "session.deleted",
    actorId: ctx.user.id,
    actorUsername: ctx.user.username,
    targetType: "session",
    targetId: ctx.params.sessionId,
    ip: ctx.ip,
  });

  return NextResponse.json({ ok: true });
});
