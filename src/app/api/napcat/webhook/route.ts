import { NextResponse } from "next/server";

import { QQ_BRIDGE_USERNAME } from "@/lib/constants";
import { enqueueJob } from "@/server/jobs/runner";
import {
  extractPromptFromMessage,
  isAllowedSource,
  parseNapCatEvent,
  sendNapcatText,
  verifyWebhookSignature,
} from "@/server/integrations/napcat";
import {
  createNapcatGeneration,
  findOrCreateSession,
} from "@/server/services/sessions";
import { getApiSettings } from "@/server/services/settings";
import { findUserByUsername } from "@/server/services/users";

export async function POST(request: Request) {
  const settings = getApiSettings();

  if (!settings.napcatEnabled) {
    return NextResponse.json({ status: "disabled" }, { status: 403 });
  }

  const rawBody = await request.text();

  if (
    settings.napcatWebhookSecret &&
    !verifyWebhookSignature(
      rawBody,
      request.headers.get("x-signature"),
      settings.napcatWebhookSecret,
    )
  ) {
    console.warn("[napcat] webhook 签名校验失败");
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = parseNapCatEvent(payload);
  if (!parsed.ok) {
    // 心跳 / 群成员事件等 NapCat 也会推过来，静默 200
    return NextResponse.json({ status: "ignored" });
  }

  const { event } = parsed;

  if (
    !isAllowedSource(
      event,
      settings.napcatAllowedUserIds,
      settings.napcatAllowedGroupIds,
    )
  ) {
    return NextResponse.json({ status: "not_allowed" });
  }

  const prompt = extractPromptFromMessage(event.rawMessage, settings.napcatTrigger);
  if (!prompt) {
    return NextResponse.json({ status: "no_trigger" });
  }

  const bridge = findUserByUsername(QQ_BRIDGE_USERNAME);
  if (!bridge) {
    console.error("[napcat] qq-bridge 用户未初始化");
    return NextResponse.json({ error: "bridge user missing" }, { status: 500 });
  }

  const sessionTitle =
    event.messageType === "group"
      ? `QQ 群 ${event.groupId}`
      : `QQ 用户 ${event.userId}`;

  const sessionId = findOrCreateSession({
    userId: bridge.id,
    title: sessionTitle,
  });

  const created = createNapcatGeneration({
    userId: bridge.id,
    sessionId,
    content: prompt,
    delivery: {
      channel: "napcat",
      userId: event.messageType === "private" ? event.userId : undefined,
      groupId: event.messageType === "group" ? event.groupId ?? undefined : undefined,
    },
    outputMode: "image_only",
  });

  enqueueJob(created.jobId);

  // 给 QQ 回个排队提示，免得用户以为没收到
  void sendNapcatText({
    target: {
      userId: event.messageType === "private" ? event.userId : undefined,
      groupId: event.messageType === "group" ? event.groupId ?? undefined : undefined,
    },
    text: "[文生图] 已排队，正在生成…",
  });

  return NextResponse.json({
    status: "queued",
    jobId: created.jobId,
    generationId: created.generationId,
  });
}
