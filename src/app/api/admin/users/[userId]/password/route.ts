import { NextResponse } from "next/server";

import { withAdmin } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/http";
import { resetPasswordSchema } from "@/lib/validators/auth";
import { recordAudit } from "@/server/services/audit";
import { resetUserPassword } from "@/server/services/users";

export const PATCH = withAdmin<{ userId: string }>(async (ctx) => {
  const body = await readJsonBody(ctx.request);

  if (body === null) {
    return NextResponse.json(
      { error: "请求体不是合法的 JSON。" },
      { status: 400 },
    );
  }

  const parsed = resetPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "密码格式不正确。" }, { status: 400 });
  }

  resetUserPassword(ctx.params.userId, parsed.data.password);

  recordAudit({
    action: "admin.user_password_reset",
    actorId: ctx.user.id,
    actorUsername: ctx.user.username,
    targetType: "user",
    targetId: ctx.params.userId,
    ip: ctx.ip,
  });

  return NextResponse.json({ ok: true });
});
