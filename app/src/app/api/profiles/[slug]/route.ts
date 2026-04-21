import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import {
  getProfilePayloadBySlug,
  isValidProfileSlug,
} from "@/server/profiles/profile.service";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;

  if (!isValidProfileSlug(slug)) {
    return NextResponse.json(
      {
        error: "invalid_profile_slug",
      },
      {
        status: 400,
        headers: PRIVATE_JSON_HEADERS,
      },
    );
  }

  const { userId } = await auth();
  const profile = await getProfilePayloadBySlug(slug, userId ?? null);

  if (!profile) {
    return NextResponse.json(
      {
        error: "profile_not_found",
      },
      {
        status: 404,
        headers: PRIVATE_JSON_HEADERS,
      },
    );
  }

  return NextResponse.json(profile, {
    status: 200,
    headers: PRIVATE_JSON_HEADERS,
  });
}
