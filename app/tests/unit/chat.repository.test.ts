import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  message: {
    count: vi.fn(),
    create: vi.fn(),
  },
  conversation: {
    update: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => prismaMock,
}));

describe("chat repository", () => {
  beforeEach(() => {
    prismaMock.message.count.mockReset();
    prismaMock.message.create.mockReset();
    prismaMock.conversation.update.mockReset();
    prismaMock.$transaction.mockReset();
  });

  it("counts unread messages excluding messages sent by the current user", async () => {
    prismaMock.message.count.mockResolvedValue(2);
    const { countUnreadMessages } = await import("@/server/chat/chat.repository");
    const since = new Date("2026-01-01T00:00:00.000Z");

    await countUnreadMessages({
      conversationId: "conv_123",
      userId: "user_123",
      since,
    });

    expect(prismaMock.message.count).toHaveBeenCalledWith({
      where: {
        conversationId: "conv_123",
        createdAt: {
          gt: since,
        },
        senderId: {
          not: "user_123",
        },
      },
    });
  });

  it("creates a text message and updates lastMessageAt in one transaction", async () => {
    const createdAt = new Date("2026-01-01T00:02:00.000Z");
    const message = {
      id: "msg_123",
      conversationId: "conv_123",
      senderId: "user_123",
      type: "TEXT",
      body: "Salut",
      createdAt,
      editedAt: null,
      sender: null,
    };

    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({
        message: {
          create: vi.fn().mockResolvedValue(message),
        },
        conversation: {
          update: prismaMock.conversation.update,
        },
      }),
    );

    const { createTextMessage } = await import("@/server/chat/chat.repository");

    await expect(
      createTextMessage({
        conversationId: "conv_123",
        senderId: "user_123",
        input: { body: "Salut" },
      }),
    ).resolves.toEqual(message);
    expect(prismaMock.conversation.update).toHaveBeenCalledWith({
      where: {
        id: "conv_123",
      },
      data: {
        lastMessageAt: createdAt,
      },
    });
  });
});
