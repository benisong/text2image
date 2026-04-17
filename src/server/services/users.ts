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
  createdAt: string;
};

function mapUser(row: {
  id: string;
  username: string;
  role: "admin" | "user";
  display_name: string | null;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
}): AppUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    displayName: row.display_name,
    isActive: Boolean(row.is_active),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

export function listUsers() {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT id, username, role, display_name, is_active, last_login_at, created_at
      FROM users
      ORDER BY role DESC, created_at ASC
    `)
    .all() as Array<{
    id: string;
    username: string;
    role: "admin" | "user";
    display_name: string | null;
    is_active: number;
    last_login_at: string | null;
    created_at: string;
  }>;

  return rows.map(mapUser);
}

export function findUserById(id: string) {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT id, username, role, display_name, is_active, last_login_at, created_at
      FROM users
      WHERE id = ?
    `)
    .get(id) as
    | {
        id: string;
        username: string;
        role: "admin" | "user";
        display_name: string | null;
        is_active: number;
        last_login_at: string | null;
        created_at: string;
      }
    | undefined;

  return row ? mapUser(row) : null;
}

export function findUserWithPassword(username: string) {
  const db = getDb();
  return db
    .prepare(`
      SELECT id, username, role, display_name, is_active, last_login_at, created_at, password_hash
      FROM users
      WHERE username = ?
    `)
    .get(username) as
    | ({
        id: string;
        username: string;
        role: "admin" | "user";
        display_name: string | null;
        is_active: number;
        last_login_at: string | null;
        created_at: string;
      } & { password_hash: string })
    | undefined;
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
      id, username, password_hash, role, display_name, is_active, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
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
    .prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .run(bcrypt.hashSync(password, 10), nowIso(), userId);
}

export function isAdmin(user: AppUser | null | undefined) {
  return user?.role === ROLE.admin;
}
