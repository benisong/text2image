import "server-only";

import { nowIso } from "@/lib/utils";
import { getDb } from "@/server/db";

export type AuditAction =
  | "auth.login_success"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.password_changed"
  | "admin.user_created"
  | "admin.user_status_updated"
  | "admin.user_password_reset"
  | "admin.api_settings_updated"
  | "session.created"
  | "session.deleted"
  | "generation.retried";

type AuditInput = {
  action: AuditAction;
  actorId?: string | null;
  actorUsername?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
};

export function recordAudit(input: AuditInput) {
  try {
    getDb()
      .prepare(
        `INSERT INTO audit_log (
          id, actor_id, actor_username, action, target_type, target_id, metadata, ip, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        input.actorId ?? null,
        input.actorUsername ?? null,
        input.action,
        input.targetType ?? null,
        input.targetId ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.ip ?? null,
        nowIso(),
      );
  } catch {
    // audit failures must not block primary actions
  }
}

export function clientIpFromRequest(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return request.headers.get("x-real-ip");
}
