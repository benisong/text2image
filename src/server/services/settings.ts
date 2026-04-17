import "server-only";

import { DEFAULT_IMAGE_ROOT, DEFAULT_MAX_CONCURRENCY } from "@/lib/constants";
import { getDb } from "@/server/db";

export function getSetting(key: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT setting_key, setting_type, value_text, value_json, is_secret FROM system_settings WHERE setting_key = ?`,
    )
    .get(key) as
    | {
        setting_key: string;
        setting_type: string;
        value_text: string | null;
        value_json: string | null;
        is_secret: number;
      }
    | undefined;
}

export function getTextSetting(key: string, fallback = "") {
  return getSetting(key)?.value_text ?? fallback;
}

export function getNumberSetting(key: string, fallback: number) {
  const raw = getTextSetting(key, String(fallback));
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function getApiSettings() {
  return {
    vertexProjectId: getTextSetting("vertex.project_id"),
    vertexLocation: getTextSetting("vertex.location"),
    imagenModel: getTextSetting("vertex.imagen_model"),
    serviceAccountJson: getTextSetting("vertex.service_account_json"),
    promptOptimizerModel: getTextSetting("prompt_optimizer.model", "template"),
    maxConcurrency: getNumberSetting(
      "generation.max_concurrency",
      DEFAULT_MAX_CONCURRENCY,
    ),
    imageRootDir: getTextSetting("storage.image_root_dir", DEFAULT_IMAGE_ROOT),
  };
}

export function updateApiSettings(input: {
  vertexProjectId: string;
  vertexLocation: string;
  imagenModel: string;
  serviceAccountJson: string;
  promptOptimizerModel: string;
  maxConcurrency: number;
  imageRootDir: string;
}) {
  const db = getDb();
  const now = new Date().toISOString();

  const update = db.prepare(`
    INSERT INTO system_settings (setting_key, setting_type, value_text, value_json, is_secret, created_at, updated_at)
    VALUES (@settingKey, @settingType, @valueText, NULL, @isSecret, @createdAt, @updatedAt)
    ON CONFLICT(setting_key) DO UPDATE SET
      setting_type = excluded.setting_type,
      value_text = excluded.value_text,
      is_secret = excluded.is_secret,
      updated_at = excluded.updated_at
  `);

  const rows = [
    ["vertex.project_id", "text", input.vertexProjectId, 0],
    ["vertex.location", "text", input.vertexLocation, 0],
    ["vertex.imagen_model", "text", input.imagenModel, 0],
    ["vertex.service_account_json", "text", input.serviceAccountJson, 1],
    ["prompt_optimizer.model", "text", input.promptOptimizerModel, 0],
    ["generation.max_concurrency", "number", String(input.maxConcurrency), 0],
    ["storage.image_root_dir", "text", input.imageRootDir, 0],
  ] as const;

  const tx = db.transaction(() => {
    for (const [settingKey, settingType, valueText, isSecret] of rows) {
      update.run({
        settingKey,
        settingType,
        valueText,
        isSecret,
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  tx();
}
