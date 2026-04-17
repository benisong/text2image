import { NextResponse } from "next/server";

import { sessionCreateSchema } from "@/lib/validators/generation";
import { getCurrentUser } from "@/server/auth/session";
import { createSession, listSessionsForUser } from "@/server/services/sessions";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  return NextResponse.json({ sessions: listSessionsForUser(user.id) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = sessionCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "会话参数不正确。" }, { status: 400 });
  }

  const sessionId = createSession(user.id, parsed.data.title || "新会话");

  return NextResponse.json({ id: sessionId });
}
