import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { chatErrorResponse } from "@/server/chat/chat.http";
import {
  createOrGetCurrentUserConversation,
  listCurrentUserConversations,
} from "@/server/chat/chat.service";
import { parseCreateConversationInput } from "@/server/chat/chat.validation";
import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";

export const dynamic = "force-dynamic";

/**
 * Liste les conversations de l'utilisateur authentifie.
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
    return NextResponse.json(await listCurrentUserConversations(userId), {
      status: 200,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    return chatErrorResponse(error);
  }
}

/**
 * Cree ou recupere une conversation depuis un profil ou un beat.
 * @param request Requete contenant targetProfileSlug ou beatSlug.
 */
export async function POST(request: Request) {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated || !userId) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  try {
    const input = parseCreateConversationInput(await request.json());

    return NextResponse.json(await createOrGetCurrentUserConversation(userId, input), {
      status: 201,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    return chatErrorResponse(error);
  }
}
