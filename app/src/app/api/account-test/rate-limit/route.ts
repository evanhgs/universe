import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

function rateLimitTestEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.RATE_LIMIT_TEST_ENABLED === "true";
}

export async function POST(request: Request) {
  if (!rateLimitTestEnabled()) {
    return NextResponse.json(
      { error: "rate_limit_test_disabled" },
      { status: 404, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const limited = await enforceRateLimit({
    request,
    policy: RATE_LIMITS.accountTestBurst,
    userId,
  });
  if (limited) return limited;

  return NextResponse.json(
    {
      ok: true,
      policy: RATE_LIMITS.accountTestBurst,
      receivedAt: new Date().toISOString(),
      userId,
    },
    { status: 200, headers: PRIVATE_JSON_HEADERS },
  );
}
