import { z } from "zod";

export const apiSettingsSchema = z.object({
  vertexProjectId: z.string().trim().min(1),
  vertexLocation: z.string().trim().min(1),
  imagenModel: z.string().trim().min(1),
  serviceAccountJson: z.string().trim().min(1),
  promptOptimizerModel: z.string().trim().optional().default(""),
  maxConcurrency: z.coerce.number().int().min(1).max(4),
  imageRootDir: z.string().trim().min(1),
});
