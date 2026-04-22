import { verifyWebhook } from "@clerk/backend/webhooks";

import {
  deleteAccountFromClerkWebhook,
  syncAccountFromClerkWebhookPayload,
} from "@/server/account/account.service";

export async function POST(request: Request) {
  try {
    const event = await verifyWebhook(request, {
      signingSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
    });

    switch (event.type) {
      case "user.created":
      case "user.updated":
        await syncAccountFromClerkWebhookPayload(event.data as never);
        break;
      case "user.deleted":
        if (event.data.id) {
          await deleteAccountFromClerkWebhook(event.data.id);
        }
        break;
      default:
        break;
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        error: "invalid_clerk_webhook",
        message: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 400 },
    );
  }
}
