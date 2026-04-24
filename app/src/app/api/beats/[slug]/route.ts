import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS, PUBLIC_JSON_HEADERS } from "@/server/http/response-headers";
import {
  deleteBeatForCurrentSeller,
  getBeatPayloadBySlug,
  updateBeatForCurrentSeller,
} from "@/server/beats/beat.service";
import { BEAT_SLUG_PATTERN } from "@/server/beats/beat.constants";
import { parseUpdateBeatInput } from "@/server/beats/beat.validation";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

function invalidSlugResponse() {
  return NextResponse.json(
    {
      error: "invalid_beat_slug",
    },
    {
      status: 400,
      headers: PUBLIC_JSON_HEADERS,
    },
  );
}

function mutationErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error.";
  const status = message === "seller_role_required" ? 403 : 400;

  return NextResponse.json(
    {
      error: message,
      message,
    },
    {
      status,
      headers: PRIVATE_JSON_HEADERS,
    },
  );
}

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;

  if (!BEAT_SLUG_PATTERN.test(slug)) {
    return invalidSlugResponse();
  }

  const { userId } = await auth();
  const beat = await getBeatPayloadBySlug(slug, userId ?? null);

  if (!beat) {
    return NextResponse.json(
      { error: "beat_not_found" },
      { status: 404, headers: PUBLIC_JSON_HEADERS },
    );
  }

  return NextResponse.json(beat, {
    status: 200,
    headers: PUBLIC_JSON_HEADERS,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const { userId } = await auth();

  if (!BEAT_SLUG_PATTERN.test(slug)) {
    return invalidSlugResponse();
  }

  if (!userId) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  try {
    const input = parseUpdateBeatInput(await request.json());
    const beat = await updateBeatForCurrentSeller(userId, slug, input);

    if (!beat) {
      return NextResponse.json(
        { error: "beat_not_found" },
        { status: 404, headers: PRIVATE_JSON_HEADERS },
      );
    }

    return NextResponse.json(beat, {
      status: 200,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    return mutationErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const { userId } = await auth();

  if (!BEAT_SLUG_PATTERN.test(slug)) {
    return invalidSlugResponse();
  }

  if (!userId) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  try {
    const deleted = await deleteBeatForCurrentSeller(userId, slug);

    if (!deleted) {
      return NextResponse.json(
        { error: "beat_not_found" },
        { status: 404, headers: PRIVATE_JSON_HEADERS },
      );
    }

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: PRIVATE_JSON_HEADERS },
    );
  } catch (error) {
    return mutationErrorResponse(error);
  }
}
