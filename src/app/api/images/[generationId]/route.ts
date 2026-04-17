import { NextResponse } from "next/server";

import { ROLE } from "@/lib/constants";
import { getCurrentUser } from "@/server/auth/session";
import { getGenerationById, getSessionById } from "@/server/services/sessions";
import { readImageByPath } from "@/server/storage/images";

export async function GET(
  _request: Request,
  context: { params: Promise<{ generationId: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { generationId } = await context.params;
  const generation = getGenerationById(generationId);

  if (!generation?.storagePath) {
    return new NextResponse("Not found", { status: 404 });
  }

  const session = getSessionById(generation.sessionId);

  if (!session || (user.role !== ROLE.admin && session.userId !== user.id)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const image = readImageByPath(generation.storagePath);

  return new NextResponse(image.file, {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
