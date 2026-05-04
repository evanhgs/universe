import "server-only";

import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";

/**
 * Convertit une erreur chat en reponse HTTP privee.
 * @param error Erreur inconnue remontee par validation/service.
 */
export function chatErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error.";
  const status =
    message === "conversation_forbidden"
      ? 403
      : message === "chat_target_not_found"
        ? 404
        : message === "self_conversation_forbidden"
          ? 409
          : message === "account_not_found"
            ? 401
            : 400;

  return NextResponse.json(
    {
      error: message,
      message,
    },
    {
      status,
      headers: PRIVATE_JSON_HEADERS,
    },
  );
}
