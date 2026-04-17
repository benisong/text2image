import { NextResponse } from "next/server";

import { withUser } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/http";
import { changePasswordSchema } from "@/lib/validators/settings";
import { recordAudit } from "@/server/services/audit";
import { changeOwnPassword } from "@/server/services/users";

export const POST = withUser(async (ctx) => {
  const body = await readJsonBody(ctx.request);

  if (body === null) {
    return NextResponse.json(
      { error: "请求体不是合法的 JSON。" },
      { status: 400 },
    );
  }

  const parsed = changePasswordSchema.safeParse(body);

  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "密码格式不正确，新密码至少 8 位。";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const result = changeOwnPassword({
    userId: ctx.user.id,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  recordAudit({
    action: "auth.password_changed",
    actorId: ctx.user.id,
    actorUsername: ctx.user.username,
    ip: ctx.ip,
  });

  return NextResponse.json({ ok: true });
});
