import { NextResponse } from "next/server";

import { apiSettingsSchema } from "@/lib/validators/settings";
import { getCurrentUser } from "@/server/auth/session";
import { getApiSettings, updateApiSettings } from "@/server/services/settings";
import { isAdmin } from "@/server/services/users";

export async function GET() {
  const user = await getCurrentUser();

  if (!isAdmin(user)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  return NextResponse.json({ settings: getApiSettings() });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();

  if (!isAdmin(user)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = apiSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "配置参数不正确。" }, { status: 400 });
  }

  updateApiSettings(parsed.data);

  return NextResponse.json({ ok: true });
}
