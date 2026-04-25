import "server-only";

import bcrypt from "bcryptjs";

import { ROLE } from "@/lib/constants";
import { nowIso } from "@/lib/utils";
import { getDb } from "@/server/db";

export type AppUser = {
  id: string;
  username: string;
  role: "admin" | "user";
  displayName: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  createdAt: string;
};

type UserRow = {
  id: string;
  username: string;
  role: "admin" | "user";
  display_name: string | null;
  is_active: number;
  last_login_at: string | null;
  must_change_password: number;
  created_at: string;
};

function mapUser(row: UserRow): AppUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    displayName: row.display_name,
    isActive: Boolean(row.is_active),
    lastLoginAt: row.last_login_at,
    mustChangePassword: Boolean(row.must_change_password),
    createdAt: row.created_at,
  };
}

const USER_SELECT_COLUMNS =
  "id, username, role, display_name, is_active, last_login_at, must_change_password, created_at";

export function listUsers() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ${USER_SELECT_COLUMNS} FROM users ORDER BY role DESC, created_at ASC`,
    )
    .all() as UserRow[];

  return rows.map(mapUser);
}

export function findUserById(id: string) {
  const db = getDb();
  const row = db
    .prepare(`SELECT ${USER_SELECT_COLUMNS} FROM users WHERE id = ?`)
    .get(id) as UserRow | undefined;

  return row ? mapUser(row) : null;
}

export function findUserByUsername(username: string) {
  const db = getDb();
  const row = db
    .prepare(`SELECT ${USER_SELECT_COLUMNS} FROM users WHERE username = ?`)
    .get(username) as UserRow | undefined;

  return row ? mapUser(row) : null;
}

export function findUserWithPassword(username: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT ${USER_SELECT_COLUMNS}, password_hash FROM users WHERE username = ?`,
    )
    .get(username) as (UserRow & { password_hash: string }) | undefined;
}

export function authenticateUser(username: string, password: string) {
  const user = findUserWithPassword(username);

  if (!user || !user.is_active) {
    return null;
  }

  const matches = bcrypt.compareSync(password, user.password_hash);

  if (!matches) {
    return null;
  }

  getDb()
    .prepare(`UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?`)
    .run(nowIso(), nowIso(), user.id);

  return findUserById(user.id);
}

export function createUser(input: {
  username: string;
  password: string;
  role: "admin" | "user";
  displayName?: string;
}) {
  const db = getDb();
  const now = nowIso();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO users (
      id, username, password_hash, role, display_name, is_active,
      must_change_password, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)
  `).run(
    id,
    input.username,
    bcrypt.hashSync(input.password, 10),
    input.role,
    input.displayName || input.username,
    now,
    now,
  );

  return findUserById(id);
}

export function updateUserStatus(userId: string, isActive: boolean) {
  getDb()
    .prepare(`UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?`)
    .run(isActive ? 1 : 0, nowIso(), userId);
}

export function resetUserPassword(userId: string, password: string) {
  getDb()
    .prepare(
      `UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?`,
    )
    .run(bcrypt.hashSync(password, 10), nowIso(), userId);
}

export function changeOwnPassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): { ok: true } | { ok: false; error: string } {
  const db = getDb();
  const row = db
    .prepare(`SELECT password_hash FROM users WHERE id = ?`)
    .get(input.userId) as { password_hash: string } | undefined;

  if (!row) {
    return { ok: false, error: "用户不存在。" };
  }

  if (!bcrypt.compareSync(input.currentPassword, row.password_hash)) {
    return { ok: false, error: "当前密码不正确。" };
  }

  db.prepare(
    `UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?`,
  ).run(bcrypt.hashSync(input.newPassword, 10), nowIso(), input.userId);

  return { ok: true };
}

export function countActiveAdmins(excludeUserId?: string): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM users
       WHERE role = ? AND is_active = 1 AND id <> ?`,
    )
    .get(ROLE.admin, excludeUserId ?? "") as { count: number };

  return row.count;
}

export function isAdmin(user: AppUser | null | undefined) {
  return user?.role === ROLE.admin;
}
