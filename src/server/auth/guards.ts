import "server-only";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/server/auth/session";
import { isAdmin } from "@/server/services/users";

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  return user;
}

export async function requireAdmin() {
  const user = await getCurrentUser();

  if (!user || !isAdmin(user)) {
    redirect("/admin/login");
  }

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  return user;
}

export async function requireAuthenticatedUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
