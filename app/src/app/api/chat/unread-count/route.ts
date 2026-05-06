import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { chatErrorResponse } from "@/server/chat/chat.http";
import { getCurrentUserUnreadCount } from "@/server/chat/chat.service";
import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";

export const dynamic = "force-dynamic";

/**
 * Retourne le total des messages non lus pour le badge in-app.
 */
export async function GET() {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated || !userId) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  try {
    return NextResponse.json(await getCurrentUserUnreadCount(userId), {
      status: 200,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    return chatErrorResponse(error);
  }
}
