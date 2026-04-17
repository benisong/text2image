import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/http";
import { resetPasswordSchema } from "@/lib/validators/auth";
import { getCurrentUser } from "@/server/auth/session";
import { isAdmin, resetUserPassword } from "@/server/services/users";

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

  const parsed = resetPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "密码格式不正确。" }, { status: 400 });
  }

  resetUserPassword(userId, parsed.data.password);

  return NextResponse.json({ ok: true });
}
