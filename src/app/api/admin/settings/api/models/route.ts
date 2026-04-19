import { NextResponse } from "next/server";
import { z } from "zod";

import { withAdmin } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/http";
import { getApiSettings } from "@/server/services/settings";

const bodySchema = z.object({
  baseUrl: z
    .string()
    .trim()
    .url({ message: "请填写完整的 API Base URL" }),
  apiKey: z.string().trim().optional().default(""),
});

export const POST = withAdmin(async (ctx) => {
  const body = await readJsonBody(ctx.request);

  if (body === null) {
    return NextResponse.json({ error: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "参数不正确。";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const providedKey = parsed.data.apiKey.trim();
  const key = providedKey.length > 0 ? providedKey : getApiSettings().imageApiKey;

  if (!key) {
    return NextResponse.json(
      { error: "缺少 API Key：请先在下方填入 Key，或保存过后再拉取。" },
      { status: 400 },
    );
  }

  const baseUrl = parsed.data.baseUrl.replace(/\/+$/, "");

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `无法连接 API: ${
          error instanceof Error ? error.message : "未知错误"
        }`,
      },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return NextResponse.json(
      {
        error: `API 返回 ${response.status}: ${text.slice(0, 400)}`,
      },
      { status: 502 },
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | { data?: Array<{ id?: unknown; owned_by?: unknown }> }
    | null;

  const raw = Array.isArray(payload?.data) ? payload!.data! : [];
  const models = raw
    .map((m) => ({
      id: typeof m.id === "string" ? m.id : String(m.id ?? ""),
      ownedBy: typeof m.owned_by === "string" ? m.owned_by : null,
    }))
    .filter((m) => m.id.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));

  return NextResponse.json({ models });
});
