import { NextResponse } from "next/server";

import {
  clearSessionCookie,
  destroySessionByToken,
  getCurrentSessionToken,
  getCurrentUser,
} from "@/server/auth/session";
import { clientIpFromRequest, recordAudit } from "@/server/services/audit";

export async function POST(request: Request) {
  const token = await getCurrentSessionToken();
  const user = token ? await getCurrentUser() : null;

  if (token) {
    await destroySessionByToken(token);
  }

  await clearSessionCookie();

  if (user) {
    recordAudit({
      action: "auth.logout",
      actorId: user.id,
      actorUsername: user.username,
      ip: clientIpFromRequest(request),
    });
  }

  return NextResponse.json({ ok: true });
}
