import { createHmac } from "node:crypto";

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
    vi.stubEnv("CRON_ALLOWED_IPS", "203.0.113.10,198.51.100.0/24");
    sendChatUnreadRemindersMock.mockReset().mockResolvedValue({
      processed: 1,
      sentOrRecorded: 1,
    });
  });

  function signedHeaders(method = "POST", path = "/api/cron/email/chat-unread-reminders") {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", "cron-secret")
      .update(`${method}\n${path}\n${timestamp}`)
      .digest("hex");

    return {
      "X-Forwarded-For": "203.0.113.10",
      "X-Cron-Timestamp": timestamp,
      "X-Cron-Signature": `sha256=${signature}`,
    };
  }

  it("rejects requests without the HMAC cron signature", async () => {
    const { GET } = await import("@/app/api/cron/email/chat-unread-reminders/route");

    const response = await GET(
      new Request("https://example.com/api/cron/email/chat-unread-reminders", {
        headers: {
          "X-Forwarded-For": "203.0.113.10",
          "X-Cron-Timestamp": String(Math.floor(Date.now() / 1000)),
        },
      }),
    );

    expect(response.status).toBe(401);
    expect(sendChatUnreadRemindersMock).not.toHaveBeenCalled();
  });

  it("rejects requests from non-whitelisted IPs", async () => {
    const { POST } = await import("@/app/api/cron/email/chat-unread-reminders/route");

    const response = await POST(
      new Request("https://example.com/api/cron/email/chat-unread-reminders", {
        headers: {
          ...signedHeaders(),
          "X-Forwarded-For": "192.0.2.44",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(sendChatUnreadRemindersMock).not.toHaveBeenCalled();
  });

  it("rejects expired timestamps", async () => {
    const { POST } = await import("@/app/api/cron/email/chat-unread-reminders/route");
    const timestamp = String(Math.floor(Date.now() / 1000) - 600);
    const signature = createHmac("sha256", "cron-secret")
      .update(`POST\n/api/cron/email/chat-unread-reminders\n${timestamp}`)
      .digest("hex");

    const response = await POST(
      new Request("https://example.com/api/cron/email/chat-unread-reminders", {
        headers: {
          "X-Forwarded-For": "203.0.113.10",
          "X-Cron-Timestamp": timestamp,
          "X-Cron-Signature": `sha256=${signature}`,
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(sendChatUnreadRemindersMock).not.toHaveBeenCalled();
  });

  it("runs unread reminders for authorized cron requests", async () => {
    const { POST } = await import("@/app/api/cron/email/chat-unread-reminders/route");

    const response = await POST(
      new Request("https://example.com/api/cron/email/chat-unread-reminders", {
        headers: signedHeaders(),
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
