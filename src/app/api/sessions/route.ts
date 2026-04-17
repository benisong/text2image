import { NextResponse } from "next/server";

import { withUser } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/http";
import { sessionCreateSchema } from "@/lib/validators/generation";
import { recordAudit } from "@/server/services/audit";
import { createSession, listSessionsForUser } from "@/server/services/sessions";

export const GET = withUser(async (ctx) => {
  return NextResponse.json({ sessions: listSessionsForUser(ctx.user.id) });
});

export const POST = withUser(async (ctx) => {
  const body = (await readJsonBody(ctx.request)) ?? {};
  const parsed = sessionCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "会话参数不正确。" }, { status: 400 });
  }

  const sessionId = createSession(ctx.user.id, parsed.data.title || "新会话");

  recordAudit({
    action: "session.created",
    actorId: ctx.user.id,
    actorUsername: ctx.user.username,
    targetType: "session",
    targetId: sessionId,
    ip: ctx.ip,
  });

  return NextResponse.json({ id: sessionId });
});
