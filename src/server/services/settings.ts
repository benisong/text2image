import "server-only";

import {
  DEFAULT_IMAGE_API_BASE_URL,
  DEFAULT_IMAGE_API_MODEL,
  DEFAULT_IMAGE_API_ROUTE,
  DEFAULT_IMAGE_API_SIZE,
  DEFAULT_IMAGE_ROOT,
  DEFAULT_MAX_CONCURRENCY,
} from "@/lib/constants";

export type ImageApiRoute = "auto" | "images" | "chat";
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
  const routeRaw = getTextSetting("image_api.route", DEFAULT_IMAGE_API_ROUTE);
  const imageApiRoute: ImageApiRoute =
    routeRaw === "images" || routeRaw === "chat" ? routeRaw : "auto";

  return {
    imageApiBaseUrl: getTextSetting("image_api.base_url", DEFAULT_IMAGE_API_BASE_URL),
    imageApiKey: getTextSetting("image_api.key"),
    imageApiModel: getTextSetting("image_api.model", DEFAULT_IMAGE_API_MODEL),
    imageApiSize: getTextSetting("image_api.size", DEFAULT_IMAGE_API_SIZE),
    imageApiRoute,
    promptOptimizerModel: getTextSetting("prompt_optimizer.model", "template"),
    maxConcurrency: getNumberSetting(
      "generation.max_concurrency",
      DEFAULT_MAX_CONCURRENCY,
    ),
    imageRootDir: getTextSetting("storage.image_root_dir", DEFAULT_IMAGE_ROOT),
  };
}

export type PublicApiSettings = {
  imageApiBaseUrl: string;
  imageApiModel: string;
  imageApiSize: string;
  imageApiRoute: ImageApiRoute;
  hasImageApiKey: boolean;
  promptOptimizerModel: string;
  maxConcurrency: number;
  imageRootDir: string;
};

export function getPublicApiSettings(): PublicApiSettings {
  const settings = getApiSettings();
  return {
    imageApiBaseUrl: settings.imageApiBaseUrl,
    imageApiModel: settings.imageApiModel,
    imageApiSize: settings.imageApiSize,
    imageApiRoute: settings.imageApiRoute,
    hasImageApiKey: settings.imageApiKey.trim().length > 0,
    promptOptimizerModel: settings.promptOptimizerModel,
    maxConcurrency: settings.maxConcurrency,
    imageRootDir: settings.imageRootDir,
  };
}

export function updateApiSettings(input: {
  imageApiBaseUrl: string;
  imageApiModel: string;
  imageApiSize: string;
  imageApiRoute: ImageApiRoute;
  imageApiKey?: string;
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

  const rows: Array<readonly [string, string, string, number]> = [
    ["image_api.base_url", "text", input.imageApiBaseUrl, 0],
    ["image_api.model", "text", input.imageApiModel, 0],
    ["image_api.size", "text", input.imageApiSize, 0],
    ["image_api.route", "text", input.imageApiRoute, 0],
    ["prompt_optimizer.model", "text", input.promptOptimizerModel, 0],
    ["generation.max_concurrency", "number", String(input.maxConcurrency), 0],
    ["storage.image_root_dir", "text", input.imageRootDir, 0],
  ];

  const trimmedKey = (input.imageApiKey ?? "").trim();
  if (trimmedKey.length > 0) {
    rows.push(["image_api.key", "text", trimmedKey, 1]);
  }

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
