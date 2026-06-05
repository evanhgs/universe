import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { syncCurrentAccountFromClerk } from "@/server/account/account.sync";
import {
  analyticsErrorResponse,
  parseAnalyticsEventInput,
  recordAnalyticsEvent,
} from "@/server/analytics/analytics.service";
import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { isAuthenticated, userId } = await auth();
  const limited = await enforceRateLimit({
    request,
    policy: RATE_LIMITS.analyticsWrite,
    userId,
  });
  if (limited) return limited;

  try {
    const input = parseAnalyticsEventInput(await request.json());

    if (!isAuthenticated) {
      const event = await recordAnalyticsEvent(input, { kind: "anonymous" });

      return NextResponse.json(
        {
          id: event.id,
          ok: true,
        },
        { status: 201, headers: PRIVATE_JSON_HEADERS },
      );
    }

    await syncCurrentAccountFromClerk();
    const event = await recordAnalyticsEvent(input, {
      kind: "user",
      clerkUserId: userId,
    });

    return NextResponse.json(
      {
        id: event.id,
        ok: true,
      },
      { status: 201, headers: PRIVATE_JSON_HEADERS },
    );
  } catch (error) {
    const response = analyticsErrorResponse(error);

    return NextResponse.json(response.body, {
      status: response.status,
      headers: PRIVATE_JSON_HEADERS,
    });
  }
}
