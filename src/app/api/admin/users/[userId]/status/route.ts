import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/http";
import { userStatusSchema } from "@/lib/validators/auth";
import { getCurrentUser } from "@/server/auth/session";
import {
  countActiveAdmins,
  findUserById,
  isAdmin,
  updateUserStatus,
} from "@/server/services/users";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const admin = await getCurrentUser();

  if (!isAdmin(admin)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { userId } = await context.params;
  const body = await readJsonBody(request);

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

  if (!parsed.data.isActive) {
    if (admin && admin.id === userId) {
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

  return NextResponse.json({ ok: true });
}
