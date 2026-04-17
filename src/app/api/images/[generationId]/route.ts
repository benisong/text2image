import { NextResponse } from "next/server";

import { withUser } from "@/lib/api-auth";
import { ROLE } from "@/lib/constants";
import {
  getGenerationById,
  getSessionById,
} from "@/server/services/sessions";
import { openImageStream } from "@/server/storage/images";

export const GET = withUser<{ generationId: string }>(async (ctx) => {
  const generation = getGenerationById(ctx.params.generationId);

  if (!generation?.storagePath) {
    return new NextResponse("Not found", { status: 404 });
  }

  const session = getSessionById(generation.sessionId);

  if (!session || (ctx.user.role !== ROLE.admin && session.userId !== ctx.user.id)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const etag = `"${generation.id}"`;
  if (ctx.request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304 });
  }

  const image = openImageStream(generation.storagePath);

  return new NextResponse(image.stream, {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(image.size),
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: etag,
    },
  });
});
