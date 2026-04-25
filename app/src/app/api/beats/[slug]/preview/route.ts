import { NextResponse } from "next/server";

import { getBeatPreviewPayloadBySlug } from "@/server/beats/beat.service";
import { BEAT_SLUG_PATTERN } from "@/server/beats/beat.constants";
import { PUBLIC_JSON_HEADERS } from "@/server/http/response-headers";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;

  if (!BEAT_SLUG_PATTERN.test(slug)) {
    return NextResponse.json(
      { error: "invalid_beat_slug" },
      { status: 400, headers: PUBLIC_JSON_HEADERS },
    );
  }

  const preview = await getBeatPreviewPayloadBySlug(slug);

  if (!preview) {
    return NextResponse.json(
      { error: "beat_preview_not_found" },
      { status: 404, headers: PUBLIC_JSON_HEADERS },
    );
  }

  return NextResponse.json(preview, {
    status: 200,
    headers: PUBLIC_JSON_HEADERS,
  });
}
