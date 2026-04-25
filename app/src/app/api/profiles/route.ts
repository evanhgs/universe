import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { listProfilesPayload } from "@/server/profiles/profile.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return NextResponse.json(
      {
        error: "unauthorized",
      },
      {
        status: 401,
        headers: PRIVATE_JSON_HEADERS,
      },
    );
  }

  const profiles = await listProfilesPayload();

  return NextResponse.json(
    {
      items: profiles,
      count: profiles.length,
    },
    {
      status: 200,
      headers: PRIVATE_JSON_HEADERS,
    },
  );
}
