import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { chatErrorResponse } from "@/server/chat/chat.http";
import {
  listCurrentUserMessages,
  sendCurrentUserMessage,
} from "@/server/chat/chat.service";
import {
  parseMessagePageInput,
  parseSendMessageInput,
} from "@/server/chat/chat.validation";
import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

type ConversationMessagesRouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const dynamic = "force-dynamic";

/**
 * Liste l'historique pagine d'une conversation.
 * @param request Requete contenant before/limit optionnels.
 * @param context Parametres dynamiques Next.
 */
export async function GET(request: Request, context: ConversationMessagesRouteContext) {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated || !userId) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const limited = await enforceRateLimit({
    request,
    policy: RATE_LIMITS.chatRead,
    userId,
  });
  if (limited) return limited;

  try {
    const { conversationId } = await context.params;
    const page = parseMessagePageInput(request.url);

    return NextResponse.json(await listCurrentUserMessages(userId, conversationId, page), {
      status: 200,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    return chatErrorResponse(error);
  }
}

/**
 * Envoie un message texte dans une conversation.
 * @param request Requete contenant body.
 * @param context Parametres dynamiques Next.
 */
export async function POST(request: Request, context: ConversationMessagesRouteContext) {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated || !userId) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const limited = await enforceRateLimit({
    request,
    policy: RATE_LIMITS.chatWrite,
    userId,
  });
  if (limited) return limited;

  try {
    const { conversationId } = await context.params;
    const input = parseSendMessageInput(await request.json());

    return NextResponse.json(await sendCurrentUserMessage(userId, conversationId, input), {
      status: 201,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    return chatErrorResponse(error);
  }
}
