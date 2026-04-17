import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth/session";
import { clientIpFromRequest } from "@/server/services/audit";
import { isAdmin, type AppUser } from "@/server/services/users";

export type ApiContext<P> = {
  request: Request;
  user: AppUser;
  params: P;
  ip: string | null;
};

export type ApiHandler<P> = (ctx: ApiContext<P>) => Promise<Response> | Response;

type RouteContext<P> = { params: Promise<P> };

export function withUser<P = Record<string, never>>(handler: ApiHandler<P>) {
  return async (request: Request, routeContext?: RouteContext<P>) => {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const params = routeContext ? await routeContext.params : ({} as P);
    return handler({ request, user, params, ip: clientIpFromRequest(request) });
  };
}

export function withAdmin<P = Record<string, never>>(handler: ApiHandler<P>) {
  return async (request: Request, routeContext?: RouteContext<P>) => {
    const user = await getCurrentUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const params = routeContext ? await routeContext.params : ({} as P);
    return handler({ request, user, params, ip: clientIpFromRequest(request) });
  };
}
