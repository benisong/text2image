import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/http";
import { changePasswordSchema } from "@/lib/validators/settings";
import { getCurrentUser } from "@/server/auth/session";
import { changeOwnPassword } from "@/server/services/users";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "未登录。" }, { status: 401 });
  }

  const body = await readJsonBody(request);

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
    userId: user.id,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
