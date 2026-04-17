import "server-only";

import fs from "node:fs";
import path from "node:path";

import { DEFAULT_IMAGE_ROOT } from "@/lib/constants";
import { resolveDataPath } from "@/server/fs-paths";
import { getTextSetting } from "@/server/services/settings";

function imageRootDir() {
  const setting = getTextSetting("storage.image_root_dir", DEFAULT_IMAGE_ROOT);
  const safe = isSandboxedRelative(setting) ? setting : DEFAULT_IMAGE_ROOT;
  const resolved = path.resolve(resolveDataPath(safe));
  const projectRoot = path.resolve(resolveDataPath("."));

  if (resolved !== projectRoot && !resolved.startsWith(projectRoot + path.sep)) {
    return path.resolve(resolveDataPath(DEFAULT_IMAGE_ROOT));
  }

  return resolved;
}

function isSandboxedRelative(value: string) {
  if (!value) {
    return false;
  }
  if (path.isAbsolute(value) || /^[a-zA-Z]:[\\/]/.test(value)) {
    return false;
  }
  return !value
    .replace(/\\/g, "/")
    .split("/")
    .some((segment) => segment === ".." || segment === ".");
}

export function sessionImageDir(sessionId: string) {
  return path.join(imageRootDir(), "sessions", sessionId);
}

export function generationImagePath(sessionId: string, generationId: string, extension = "png") {
  return path.join(sessionImageDir(sessionId), `${generationId}.${extension}`);
}

export function ensureSessionImageDir(sessionId: string) {
  fs.mkdirSync(sessionImageDir(sessionId), { recursive: true });
}

export function saveGenerationImage(input: {
  sessionId: string;
  generationId: string;
  mimeType: string;
  bytes: Buffer;
}) {
  ensureSessionImageDir(input.sessionId);
  const extension = input.mimeType.includes("jpeg") ? "jpg" : "png";
  const absolutePath = generationImagePath(input.sessionId, input.generationId, extension);

  fs.writeFileSync(absolutePath, input.bytes);

  return {
    absolutePath,
    fileSizeBytes: input.bytes.byteLength,
    publicUrl: `/api/images/${input.generationId}`,
  };
}

export function readImageByPath(storagePath: string) {
  const file = fs.readFileSync(storagePath);
  const extension = path.extname(storagePath).toLowerCase();
  const mimeType =
    extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";

  return {
    file,
    mimeType,
  };
}

export function deleteSessionImageDirectory(sessionId: string) {
  const directory = sessionImageDir(sessionId);

  if (fs.existsSync(directory)) {
    fs.rmSync(directory, { recursive: true, force: false });
  }
}
