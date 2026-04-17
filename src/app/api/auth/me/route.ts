import { NextResponse } from "next/server";

import { withUser } from "@/lib/api-auth";

export const GET = withUser(async (ctx) => {
  return NextResponse.json({ user: ctx.user });
});
