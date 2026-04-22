import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { getCurrentAccountSnapshot } from "@/server/account/account.service";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const account = await getCurrentAccountSnapshot();

  return NextResponse.json(account, {
    status: 200,
    headers: PRIVATE_JSON_HEADERS,
  });
}
