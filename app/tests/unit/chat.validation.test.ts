import { describe, expect, it } from "vitest";

import {
  CHAT_MESSAGE_MAX_LENGTH,
  parseCreateConversationInput,
  parseMessagePageInput,
  parseSendMessageInput,
} from "@/server/chat/chat.validation";

describe("chat validation", () => {
  it("normalizes profile and beat conversation targets", () => {
    expect(parseCreateConversationInput({ targetProfileSlug: " seller-one " })).toEqual({
      targetProfileSlug: "seller-one",
      beatSlug: undefined,
    });
    expect(parseCreateConversationInput({ beatSlug: "beat-one" })).toEqual({
      targetProfileSlug: undefined,
      beatSlug: "beat-one",
    });
  });

  it("rejects missing or combined conversation targets", () => {
    expect(() => parseCreateConversationInput({})).toThrow(
      "targetProfileSlug or beatSlug is required.",
    );
    expect(() =>
      parseCreateConversationInput({
        targetProfileSlug: "seller-one",
        beatSlug: "beat-one",
      }),
    ).toThrow("targetProfileSlug and beatSlug cannot be combined.");
  });

  it("normalizes and limits text messages", () => {
    expect(parseSendMessageInput({ body: "  Bonjour  " })).toEqual({
      body: "Bonjour",
    });
    expect(() => parseSendMessageInput({ body: "   " })).toThrow(
      "message body is required.",
    );
    expect(() =>
      parseSendMessageInput({ body: "x".repeat(CHAT_MESSAGE_MAX_LENGTH + 1) }),
    ).toThrow(`message body must be ${CHAT_MESSAGE_MAX_LENGTH} characters or less.`);
  });

  it("validates message pagination", () => {
    expect(parseMessagePageInput("https://example.com/api/chat/conversations/1/messages")).toEqual({
      limit: 50,
    });
    expect(
      parseMessagePageInput(
        "https://example.com/api/chat/conversations/1/messages?limit=10&before=2026-01-01T00:00:00.000Z",
      ),
    ).toEqual({
      limit: 10,
      before: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(() =>
      parseMessagePageInput("https://example.com/api/chat/conversations/1/messages?limit=0"),
    ).toThrow("limit must be between 1 and 100.");
    expect(() =>
      parseMessagePageInput(
        "https://example.com/api/chat/conversations/1/messages?before=nope",
      ),
    ).toThrow("before is invalid.");
  });
});
