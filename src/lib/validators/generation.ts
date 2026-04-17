import { z } from "zod";

export const sessionCreateSchema = z.object({
  title: z.string().trim().max(120).optional().default(""),
});

export const messageCreateSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  mode: z.enum(["new_image", "modify_last"]).default("new_image"),
  parentGenerationId: z.string().trim().optional().nullable(),
  keepSeed: z.boolean().default(false),
  outputMode: z.enum(["image_only", "image_with_commentary"]).default("image_only"),
});
