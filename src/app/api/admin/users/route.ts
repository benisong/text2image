import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth/session";
import { createUser, isAdmin, listUsers } from "@/server/services/users";
import { createUserSchema } from "@/lib/validators/auth";

export async function GET() {
  const user = await getCurrentUser();

  if (!isAdmin(user)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  return NextResponse.json({ users: listUsers() });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!isAdmin(user)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "用户参数不正确。" }, { status: 400 });
  }

  try {
    const created = createUser(parsed.data);
    return NextResponse.json({ user: created });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "创建用户失败，请检查用户名是否重复。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
