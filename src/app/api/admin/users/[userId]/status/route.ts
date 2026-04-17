import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth/session";
import { isAdmin, updateUserStatus } from "@/server/services/users";
import { userStatusSchema } from "@/lib/validators/auth";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const admin = await getCurrentUser();

  if (!isAdmin(admin)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const { userId } = await context.params;
  const body = await request.json();
  const parsed = userStatusSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "状态参数不正确。" }, { status: 400 });
  }

  updateUserStatus(userId, parsed.data.isActive);

  return NextResponse.json({ ok: true });
}
