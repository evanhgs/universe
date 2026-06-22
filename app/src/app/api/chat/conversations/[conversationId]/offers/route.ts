import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { chatErrorResponse } from "@/server/chat/chat.http";
import { createCurrentUserChatOffer } from "@/server/chat/chat.service";
import { parseCreateChatOfferInput } from "@/server/chat/chat.validation";
import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

type ConversationOfferRouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: ConversationOfferRouteContext) {
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
    const input = parseCreateChatOfferInput(await request.json());

    return NextResponse.json(await createCurrentUserChatOffer(userId, conversationId, input), {
      status: 201,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    return chatErrorResponse(error);
  }
}
