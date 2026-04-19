import { z } from "zod";

function isSandboxedRelativePath(value: string) {
  if (!value) {
    return false;
  }

  if (value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value)) {
    return false;
  }

  const normalized = value.replace(/\\/g, "/");

  return !normalized
    .split("/")
    .some((segment) => segment === ".." || segment === ".");
}

export const apiSettingsSchema = z.object({
  imageApiBaseUrl: z
    .string()
    .trim()
    .url({ message: "请填写完整的 API Base URL，例如 https://api.openai.com/v1" }),
  imageApiKey: z.string().trim().optional().default(""),
  imageApiModel: z.string().trim().min(1),
  imageApiSize: z
    .string()
    .trim()
    .regex(/^\d{2,5}x\d{2,5}$/i, { message: "尺寸格式应为 WIDTHxHEIGHT，例如 1024x1024" })
    .default("1024x1024"),
  imageApiRoute: z.enum(["auto", "images", "chat"]).default("auto"),
  promptOptimizerModel: z.string().trim().optional().default(""),
  maxConcurrency: z.coerce.number().int().min(1).max(4),
  imageRootDir: z
    .string()
    .trim()
    .min(1)
    .refine(isSandboxedRelativePath, {
      message: "图片目录必须是项目数据目录下的相对路径，且不允许包含 .. 或 .",
    }),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "新密码不能与当前密码相同。",
    path: ["newPassword"],
  });
