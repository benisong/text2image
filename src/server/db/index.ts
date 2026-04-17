import "server-only";

import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

import {
  APP_NAME,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  DEFAULT_IMAGE_ROOT,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_VERTEX_LOCATION,
  DEFAULT_VERTEX_MODEL,
  ROLE,
} from "@/lib/constants";
import { nowIso } from "@/lib/utils";
import { resolveDataPath } from "@/server/fs-paths";

const globalForDb = globalThis as typeof globalThis & {
  __text2imageDb?: Database;
};

function ensureDirectories() {
  const dataDir = resolveDataPath("data");
  const imageDir = resolveDataPath(DEFAULT_IMAGE_ROOT);

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(imageDir, { recursive: true });
}

function databaseFilePath() {
  return resolveDataPath("data", "app.db");
}

function createDatabase() {
  ensureDirectories();

  const db = new Database(databaseFilePath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      display_name TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_message_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      message_type TEXT NOT NULL,
      content_text TEXT,
      generation_id TEXT,
      job_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS generations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      parent_generation_id TEXT,
      trigger_message_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      original_prompt TEXT NOT NULL,
      effective_prompt TEXT NOT NULL,
      negative_prompt TEXT,
      prompt_json TEXT NOT NULL,
      seed INTEGER,
      keep_seed INTEGER NOT NULL DEFAULT 0,
      aspect_ratio TEXT NOT NULL,
      image_size TEXT,
      mime_type TEXT NOT NULL,
      status TEXT NOT NULL,
      vertex_request_id TEXT,
      output_mode TEXT NOT NULL,
      explanation_text TEXT,
      explanation_status TEXT,
      storage_bucket TEXT,
      storage_path TEXT,
      public_url TEXT,
      width INTEGER,
      height INTEGER,
      file_size_bytes INTEGER,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_generation_id) REFERENCES generations(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      generation_id TEXT NOT NULL,
      job_type TEXT NOT NULL,
      queue_name TEXT NOT NULL,
      queue_job_id TEXT,
      status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      progress INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (generation_id) REFERENCES generations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      setting_type TEXT NOT NULL,
      value_json TEXT,
      value_text TEXT,
      is_secret INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON chat_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_generations_session_id ON generations(session_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  `);

  migrateSchema(db);
  bootstrapData(db);

  return db;
}

function migrateSchema(db: Database) {
  const columns = db
    .prepare(`PRAGMA table_info(users)`)
    .all() as Array<{ name: string }>;

  if (!columns.some((column) => column.name === "must_change_password")) {
    db.exec(
      `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`,
    );
  }
}

function upsertSetting(
  db: Database,
  key: string,
  type: string,
  textValue: string | null,
  jsonValue: string | null,
  isSecret = false,
) {
  const now = nowIso();

  db.prepare(`
    INSERT INTO system_settings (
      setting_key, setting_type, value_text, value_json, is_secret, created_at, updated_at
    )
    VALUES (@settingKey, @settingType, @valueText, @valueJson, @isSecret, @createdAt, @updatedAt)
    ON CONFLICT(setting_key) DO NOTHING
  `).run({
    settingKey: key,
    settingType: type,
    valueText: textValue,
    valueJson: jsonValue,
    isSecret: isSecret ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  });
}

function bootstrapData(db: Database) {
  const now = nowIso();
  const existingAdmin = db
    .prepare(`SELECT id FROM users WHERE role = ? LIMIT 1`)
    .get(ROLE.admin) as { id: string } | undefined;

  if (!existingAdmin) {
    const initialPassword = process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
    const mustChange =
      !process.env.ADMIN_PASSWORD || initialPassword === DEFAULT_ADMIN_PASSWORD;

    db.prepare(`
      INSERT INTO users (
        id, username, password_hash, role, display_name, is_active,
        must_change_password, created_at, updated_at
      )
      VALUES (@id, @username, @passwordHash, @role, @displayName, 1, @mustChange, @createdAt, @updatedAt)
    `).run({
      id: crypto.randomUUID(),
      username: process.env.ADMIN_USERNAME ?? DEFAULT_ADMIN_USERNAME,
      passwordHash: bcrypt.hashSync(initialPassword, 10),
      role: ROLE.admin,
      displayName: APP_NAME + " Admin",
      mustChange: mustChange ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  upsertSetting(
    db,
    "vertex.project_id",
    "text",
    process.env.VERTEX_PROJECT_ID ?? "",
    null,
  );
  upsertSetting(
    db,
    "vertex.location",
    "text",
    process.env.VERTEX_LOCATION ?? DEFAULT_VERTEX_LOCATION,
    null,
  );
  upsertSetting(
    db,
    "vertex.imagen_model",
    "text",
    process.env.VERTEX_IMAGEN_MODEL ?? DEFAULT_VERTEX_MODEL,
    null,
  );
  upsertSetting(
    db,
    "vertex.service_account_json",
    "text",
    process.env.VERTEX_SERVICE_ACCOUNT_JSON ?? "",
    null,
    true,
  );
  upsertSetting(
    db,
    "prompt_optimizer.model",
    "text",
    process.env.PROMPT_OPTIMIZER_MODEL ?? "template",
    null,
  );
  upsertSetting(
    db,
    "generation.max_concurrency",
    "number",
    String(process.env.GENERATION_MAX_CONCURRENCY ?? DEFAULT_MAX_CONCURRENCY),
    null,
  );
  upsertSetting(
    db,
    "storage.image_root_dir",
    "text",
    process.env.IMAGE_ROOT_DIR ?? DEFAULT_IMAGE_ROOT,
    null,
  );
}

export function getDb() {
  if (!globalForDb.__text2imageDb) {
    globalForDb.__text2imageDb = createDatabase();
    queueMicrotask(() => {
      void (async () => {
        try {
          const { recoverPendingJobsOnStartup } = await import(
            "@/server/jobs/runner"
          );
          recoverPendingJobsOnStartup();
        } catch {
          // runner recovery is best-effort
        }
      })();
    });
  }

  return globalForDb.__text2imageDb;
}

export function transaction<T>(fn: (db: Database) => T) {
  const db = getDb();
  const tx = db.transaction(() => fn(db));
  return tx();
}

export type Row<T> = T;

export function relativeStoragePublicUrl(storagePath: string) {
  const fileName = path.basename(storagePath);
  return `/api/images/${fileName.replace(path.extname(fileName), "")}`;
}
