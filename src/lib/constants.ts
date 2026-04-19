export const APP_NAME = "Text2Image";
export const APP_SESSION_COOKIE = "text2image_session";
export const DEFAULT_ADMIN_USERNAME = "admin";
export const DEFAULT_ADMIN_PASSWORD = "admin123456";
export const DEFAULT_IMAGE_API_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_IMAGE_API_MODEL = "dall-e-3";
export const DEFAULT_IMAGE_API_SIZE = "1024x1024";
export const DEFAULT_IMAGE_ROOT = "data/images";
export const DEFAULT_MAX_CONCURRENCY = 2;
export const DEFAULT_NEGATIVE_PROMPT =
  "blurry, low quality, extra fingers, deformed hands, duplicated face";

export const JOB_STATUS = {
  waiting: "waiting",
  active: "active",
  completed: "completed",
  failed: "failed",
} as const;

export const GENERATION_STATUS = {
  queued: "queued",
  generating: "generating",
  completed: "completed",
  failed: "failed",
} as const;

export const OUTPUT_MODE = {
  imageOnly: "image_only",
  imageWithCommentary: "image_with_commentary",
} as const;

export const ROLE = {
  admin: "admin",
  user: "user",
} as const;
