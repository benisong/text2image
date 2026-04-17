import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/http";
import { ROLE } from "@/lib/constants";
import { loginSchema } from "@/lib/validators/auth";
import { createUserSession, setSessionCookie } from "@/server/auth/session";
import { clientIpFromRequest, recordAudit } from "@/server/services/audit";
import { authenticateUser } from "@/server/services/users";

export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);
  const body = await readJsonBody(request);

  if (body === null) {
    return NextResponse.json(
      { error: "请求体不是合法的 JSON。" },
      { status: 400 },
    );
  }

  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "用户名或密码格式不正确。" },
      { status: 400 },
    );
  }

  const user = authenticateUser(parsed.data.username, parsed.data.password);

  if (!user) {
    recordAudit({
      action: "auth.login_failed",
      actorUsername: parsed.data.username,
      ip,
    });
    return NextResponse.json({ error: "用户名或密码错误。" }, { status: 401 });
  }

  if (parsed.data.requiredRole && user.role !== parsed.data.requiredRole) {
    recordAudit({
      action: "auth.login_failed",
      actorId: user.id,
      actorUsername: user.username,
      metadata: { reason: "role_mismatch", requiredRole: parsed.data.requiredRole },
      ip,
    });
    const error =
      parsed.data.requiredRole === ROLE.admin
        ? "请使用管理员账号登录。"
        : "请使用普通用户账号登录。";
    return NextResponse.json({ error }, { status: 403 });
  }

  const session = await createUserSession(user.id);
  await setSessionCookie(session.token, session.expiresAt);

  recordAudit({
    action: "auth.login_success",
    actorId: user.id,
    actorUsername: user.username,
    ip,
  });

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  });
}
