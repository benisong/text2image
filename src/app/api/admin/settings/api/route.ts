import { NextResponse } from "next/server";

import { withAdmin } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/http";
import { apiSettingsSchema } from "@/lib/validators/settings";
import { recordAudit } from "@/server/services/audit";
import {
  getPublicApiSettings,
  updateApiSettings,
} from "@/server/services/settings";

export const GET = withAdmin(async () => {
  return NextResponse.json({ settings: getPublicApiSettings() });
});

export const PUT = withAdmin(async (ctx) => {
  const body = await readJsonBody(ctx.request);

  if (body === null) {
    return NextResponse.json({ error: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  const parsed = apiSettingsSchema.safeParse(body);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "配置参数不正确。";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  updateApiSettings(parsed.data);

  recordAudit({
    action: "admin.api_settings_updated",
    actorId: ctx.user.id,
    actorUsername: ctx.user.username,
    targetType: "settings",
    metadata: {
      updatedApiKey: (parsed.data.imageApiKey ?? "").trim().length > 0,
      baseUrl: parsed.data.imageApiBaseUrl,
      model: parsed.data.imageApiModel,
    },
    ip: ctx.ip,
  });

  return NextResponse.json({ ok: true });
});
