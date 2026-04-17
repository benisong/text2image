import { NextResponse } from "next/server";

import {
  clearSessionCookie,
  destroySessionByToken,
  getCurrentSessionToken,
} from "@/server/auth/session";

export async function POST() {
  const token = await getCurrentSessionToken();

  if (token) {
    await destroySessionByToken(token);
  }

  await clearSessionCookie();

  return NextResponse.json({ ok: true });
}
