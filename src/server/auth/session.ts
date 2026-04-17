import "server-only";

import { cookies } from "next/headers";

import { APP_SESSION_COOKIE } from "@/lib/constants";
import { nowIso } from "@/lib/utils";
import { getDb } from "@/server/db";
import { findUserById } from "@/server/services/users";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export async function createUserSession(userId: string) {
  const db = getDb();
  const token = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  db.prepare(`
    INSERT INTO auth_sessions (id, user_id, session_token, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), userId, token, expiresAt, now.toISOString(), now.toISOString());

  return {
    token,
    expiresAt,
  };
}

export async function setSessionCookie(token: string, expiresAt: string) {
  const store = await cookies();
  store.set(APP_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(APP_SESSION_COOKIE);
}

export async function destroySessionByToken(token: string) {
  getDb().prepare(`DELETE FROM auth_sessions WHERE session_token = ?`).run(token);
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(APP_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const session = getDb()
    .prepare(`
      SELECT user_id, expires_at
      FROM auth_sessions
      WHERE session_token = ?
    `)
    .get(token) as { user_id: string; expires_at: string } | undefined;

  if (!session) {
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await destroySessionByToken(token);
    return null;
  }

  getDb()
    .prepare(`UPDATE auth_sessions SET updated_at = ? WHERE session_token = ?`)
    .run(nowIso(), token);

  return findUserById(session.user_id);
}

export async function getCurrentSessionToken() {
  const store = await cookies();
  return store.get(APP_SESSION_COOKIE)?.value ?? null;
}
