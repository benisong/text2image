import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { getApiSettings } from "@/server/services/settings";

export type NapCatMessageEvent = {
  postType: "message";
  messageType: "private" | "group";
  userId: number;
  groupId: number | null;
  rawMessage: string;
  selfId: number | null;
};

export type NapCatTarget = {
  userId?: number | null;
  groupId?: number | null;
};

export type ParseResult =
  | { ok: true; event: NapCatMessageEvent }
  | { ok: false; reason: "ignored" }
  | { ok: false; reason: "invalid"; message: string };

/**
 * 把 OneBot v11 的事件 payload 标准化成 NapCatMessageEvent。
 * 非 message 事件返回 ignored；不合法事件返回 invalid。
 */
export function parseNapCatEvent(body: unknown): ParseResult {
  if (!body || typeof body !== "object") {
    return { ok: false, reason: "invalid", message: "payload not object" };
  }
  const obj = body as Record<string, unknown>;
  if (obj.post_type !== "message") {
    return { ok: false, reason: "ignored" };
  }
  const messageType = obj.message_type;
  if (messageType !== "private" && messageType !== "group") {
    return { ok: false, reason: "ignored" };
  }
  const userIdRaw = obj.user_id;
  const userId = typeof userIdRaw === "number" ? userIdRaw : Number(userIdRaw);
  if (!Number.isFinite(userId)) {
    return { ok: false, reason: "invalid", message: "missing user_id" };
  }
  const groupIdRaw = obj.group_id;
  const groupId =
    typeof groupIdRaw === "number"
      ? groupIdRaw
      : groupIdRaw != null
        ? Number(groupIdRaw)
        : null;
  const rawMessage =
    typeof obj.raw_message === "string"
      ? obj.raw_message
      : typeof obj.message === "string"
        ? obj.message
        : "";
  const selfIdRaw = obj.self_id;
  const selfId =
    typeof selfIdRaw === "number"
      ? selfIdRaw
      : selfIdRaw != null
        ? Number(selfIdRaw)
        : null;

  return {
    ok: true,
    event: {
      postType: "message",
      messageType,
      userId,
      groupId: groupId && Number.isFinite(groupId) ? groupId : null,
      rawMessage,
      selfId,
    },
  };
}

/**
 * 校验 OneBot v11 webhook 的 X-Signature 头。NapCat 用 HMAC-SHA1。
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!secret) return true; // 未配置 secret 则跳过校验
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac("sha1", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  const provided = signatureHeader.replace(/^sha1=/, "").trim();

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(provided, "hex"),
    );
  } catch {
    return false;
  }
}

function csvIds(csv: string): Set<number> {
  return new Set(
    csv
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n)),
  );
}

/**
 * 检查事件是否被白名单允许触发生图。
 * 群聊：群必须在 allowed_group_ids；用户白名单非空时还要进一步限制成员。
 * 私聊：user_id 必须在 allowed_user_ids（非空时）。
 * 两个白名单都为空 → 拒绝（避免无意中开放给所有人）。
 */
export function isAllowedSource(
  event: NapCatMessageEvent,
  allowedUserCsv: string,
  allowedGroupCsv: string,
): boolean {
  const userSet = csvIds(allowedUserCsv);
  const groupSet = csvIds(allowedGroupCsv);

  if (event.messageType === "group") {
    if (event.groupId == null || groupSet.size === 0) return false;
    if (!groupSet.has(event.groupId)) return false;
    if (userSet.size > 0 && !userSet.has(event.userId)) return false;
    return true;
  }
  // private
  if (userSet.size === 0) return false;
  return userSet.has(event.userId);
}

/**
 * 从 raw_message 里提取 trigger 后面的 prompt；不匹配返回 null。
 * 支持 @<bot> 前缀（OneBot 群消息常见）。
 */
export function extractPromptFromMessage(
  raw: string,
  trigger: string,
): string | null {
  if (!raw) return null;
  // 先把开头的 @ 去掉
  let stripped = raw.replace(/^\[CQ:at,qq=\d+\]\s*/g, "");
  stripped = stripped.replace(/^@\S+\s*/g, "");
  stripped = stripped.trim();

  if (!trigger) return null;
  if (!stripped.startsWith(trigger)) return null;

  const remainder = stripped.slice(trigger.length).trim();
  return remainder.length > 0 ? remainder : null;
}

/**
 * 通过 NapCat HTTP API 发图回 QQ。图片用 base64:// 直接传，无需公开图片地址。
 */
export async function sendNapcatImage(input: {
  storagePath: string;
  target: NapCatTarget;
  caption?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const settings = getApiSettings();
  const baseUrl = settings.napcatBaseUrl.trim().replace(/\/+$/, "");
  const token = settings.napcatAccessToken.trim();

  if (!baseUrl) {
    return { ok: false, error: "NapCat base URL 未配置" };
  }

  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(input.storagePath);
  } catch (error) {
    return {
      ok: false,
      error: `读取本地图片失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const ext = path.extname(input.storagePath).toLowerCase();
  void ext; // mime is decided by NapCat, we only pass base64
  const base64 = bytes.toString("base64");

  type Segment = { type: string; data: Record<string, string> };
  const segments: Segment[] = [];
  if (input.caption) {
    segments.push({ type: "text", data: { text: input.caption } });
  }
  segments.push({ type: "image", data: { file: `base64://${base64}` } });

  const isGroup = !!input.target.groupId;
  const endpoint = isGroup ? "send_group_msg" : "send_private_msg";
  const body: Record<string, unknown> = {
    message: segments,
  };
  if (isGroup) {
    body.group_id = input.target.groupId;
  } else {
    body.user_id = input.target.userId;
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return {
      ok: false,
      error: `请求 NapCat 失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      error: `NapCat 返回 ${response.status}: ${text.slice(0, 300)}`,
    };
  }

  return { ok: true };
}

/**
 * 给 QQ 发一段纯文字（用于错误提示）。
 */
export async function sendNapcatText(input: {
  target: NapCatTarget;
  text: string;
}): Promise<void> {
  const settings = getApiSettings();
  const baseUrl = settings.napcatBaseUrl.trim().replace(/\/+$/, "");
  const token = settings.napcatAccessToken.trim();
  if (!baseUrl) return;

  const isGroup = !!input.target.groupId;
  const endpoint = isGroup ? "send_group_msg" : "send_private_msg";
  const body: Record<string, unknown> = {
    message: [{ type: "text", data: { text: input.text } }],
  };
  if (isGroup) body.group_id = input.target.groupId;
  else body.user_id = input.target.userId;

  try {
    await fetch(`${baseUrl}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    // 静默失败
  }
}
