import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/http";
import { apiSettingsSchema } from "@/lib/validators/settings";
import { getCurrentUser } from "@/server/auth/session";
import {
  getPublicApiSettings,
  updateApiSettings,
} from "@/server/services/settings";
import { isAdmin } from "@/server/services/users";

export async function GET() {
  const user = await getCurrentUser();

  if (!isAdmin(user)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  return NextResponse.json({ settings: getPublicApiSettings() });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();

  if (!isAdmin(user)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await readJsonBody(request);

  if (body === null) {
    return NextResponse.json({ error: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  const parsed = apiSettingsSchema.safeParse(body);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "配置参数不正确。";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  updateApiSettings(parsed.data);

  return NextResponse.json({ ok: true });
}
