import { NextResponse } from "next/server";

import { withAdmin } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/http";
import { createUserSchema } from "@/lib/validators/auth";
import { recordAudit } from "@/server/services/audit";
import { createUser, listUsers } from "@/server/services/users";

export const GET = withAdmin(async () => {
  return NextResponse.json({ users: listUsers() });
});

export const POST = withAdmin(async (ctx) => {
  const body = await readJsonBody(ctx.request);

  if (body === null) {
    return NextResponse.json(
      { error: "请求体不是合法的 JSON。" },
      { status: 400 },
    );
  }

  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "用户参数不正确。" }, { status: 400 });
  }

  try {
    const created = createUser(parsed.data);

    if (created) {
      recordAudit({
        action: "admin.user_created",
        actorId: ctx.user.id,
        actorUsername: ctx.user.username,
        targetType: "user",
        targetId: created.id,
        metadata: { role: created.role, username: created.username },
        ip: ctx.ip,
      });
    }

    return NextResponse.json({ user: created });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "创建用户失败，请检查用户名是否重复。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
});
