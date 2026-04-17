import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth/session";
import {
  deleteSessionWithAssets,
  getMessagesForSession,
  getSessionById,
} from "@/server/services/sessions";

export async function GET(
  _request: Request,
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

  return NextResponse.json({
    session,
    messages: getMessagesForSession(sessionId),
  });
}

export async function DELETE(
  _request: Request,
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

  deleteSessionWithAssets(sessionId);

  return NextResponse.json({ ok: true });
}
