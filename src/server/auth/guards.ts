import "server-only";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/server/auth/session";
import { isAdmin } from "@/server/services/users";

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireAdmin() {
  const user = await getCurrentUser();

  if (!user || !isAdmin(user)) {
    redirect("/admin/login");
  }

  return user;
}
