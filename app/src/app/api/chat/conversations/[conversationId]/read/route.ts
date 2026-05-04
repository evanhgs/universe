import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { chatErrorResponse } from "@/server/chat/chat.http";
import { markCurrentUserConversationRead } from "@/server/chat/chat.service";
import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";

type ConversationReadRouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const dynamic = "force-dynamic";

/**
 * Marque une conversation comme lue pour l'utilisateur courant.
 * @param _request Requete PATCH.
 * @param context Parametres dynamiques Next.
 */
export async function PATCH(_request: Request, context: ConversationReadRouteContext) {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated || !userId) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  try {
    const { conversationId } = await context.params;

    return NextResponse.json(await markCurrentUserConversationRead(userId, conversationId), {
      status: 200,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    return chatErrorResponse(error);
  }
}
