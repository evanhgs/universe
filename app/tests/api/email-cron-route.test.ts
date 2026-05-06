import { beforeEach, describe, expect, it, vi } from "vitest";

const sendChatUnreadRemindersMock = vi.fn();

vi.mock("@/server/email/email.service", () => ({
  emailService: {
    sendChatUnreadReminders: sendChatUnreadRemindersMock,
  },
}));

describe("chat unread reminder cron route", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    sendChatUnreadRemindersMock.mockReset().mockResolvedValue({
      processed: 1,
      sentOrRecorded: 1,
    });
  });

  it("rejects requests without the cron bearer token", async () => {
    const { GET } = await import("@/app/api/cron/email/chat-unread-reminders/route");

    const response = await GET(
      new Request("https://example.com/api/cron/email/chat-unread-reminders"),
    );

    expect(response.status).toBe(401);
    expect(sendChatUnreadRemindersMock).not.toHaveBeenCalled();
  });

  it("runs unread reminders for authorized cron requests", async () => {
    const { POST } = await import("@/app/api/cron/email/chat-unread-reminders/route");

    const response = await POST(
      new Request("https://example.com/api/cron/email/chat-unread-reminders", {
        headers: {
          Authorization: "Bearer cron-secret",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(sendChatUnreadRemindersMock).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({
      processed: 1,
      sentOrRecorded: 1,
    });
  });
});
