import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import {
  getCurrentAccountSnapshot,
  updateCurrentAccountRoles,
} from "@/server/account/account.service";
import { parseSelfServiceRoles } from "@/server/account/account.validation";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const account = await getCurrentAccountSnapshot();

  return NextResponse.json(
    { roles: account.roles },
    {
      status: 200,
      headers: PRIVATE_JSON_HEADERS,
    },
  );
}

export async function PUT(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  try {
    const roles = parseSelfServiceRoles(await request.json());
    const account = await updateCurrentAccountRoles(userId, roles);

    return NextResponse.json(
      { roles: account.roles },
      {
        status: 200,
        headers: PRIVATE_JSON_HEADERS,
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "invalid_roles_update",
        message: error instanceof Error ? error.message : "Unknown error.",
      },
      {
        status: 400,
        headers: PRIVATE_JSON_HEADERS,
      },
    );
  }
}
