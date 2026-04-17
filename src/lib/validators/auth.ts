import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(128),
  requiredRole: z.enum(["admin", "user"]).optional(),
});

export const createUserSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(128),
  role: z.enum(["admin", "user"]),
  displayName: z.string().trim().max(80).optional().default(""),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(6).max(128),
});

export const userStatusSchema = z.object({
  isActive: z.boolean(),
});
