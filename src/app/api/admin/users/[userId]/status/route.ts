import { NextResponse } from "next/server";

import { withAdmin } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/http";
import { userStatusSchema } from "@/lib/validators/auth";
import { recordAudit } from "@/server/services/audit";
import {
  countActiveAdmins,
  findUserById,
  isAdmin,
  updateUserStatus,
} from "@/server/services/users";

export const PATCH = withAdmin<{ userId: string }>(async (ctx) => {
  const body = await readJsonBody(ctx.request);

  if (body === null) {
    return NextResponse.json(
      { error: "请求体不是合法的 JSON。" },
      { status: 400 },
    );
  }

  const parsed = userStatusSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "状态参数不正确。" }, { status: 400 });
  }

  const { userId } = ctx.params;

  if (!parsed.data.isActive) {
    if (ctx.user.id === userId) {
      return NextResponse.json(
        { error: "不能停用当前登录的管理员账号。" },
        { status: 400 },
      );
    }

    const target = findUserById(userId);

    if (target && isAdmin(target) && target.isActive) {
      const remaining = countActiveAdmins(userId);
      if (remaining <= 0) {
        return NextResponse.json(
          { error: "系统至少需要保留一个启用状态的管理员。" },
          { status: 400 },
        );
      }
    }
  }

  updateUserStatus(userId, parsed.data.isActive);

  recordAudit({
    action: "admin.user_status_updated",
    actorId: ctx.user.id,
    actorUsername: ctx.user.username,
    targetType: "user",
    targetId: userId,
    metadata: { isActive: parsed.data.isActive },
    ip: ctx.ip,
  });

  return NextResponse.json({ ok: true });
});
