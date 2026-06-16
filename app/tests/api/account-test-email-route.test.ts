import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const sendEmailMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/server/email/email.service", () => ({
  emailService: {
    send: sendEmailMock,
  },
}));

describe("account test email route", () => {
  beforeEach(() => {
    authMock.mockReset().mockResolvedValue({ isAuthenticated: true });
    sendEmailMock.mockReset().mockResolvedValue({
      id: "email_event_123",
      status: "SENT",
    });
    vi.stubEnv("EMAIL_TEST_ENABLED", "true");
    vi.stubEnv("RESEND_EMAIL_FROM", "Universe <service@example.com>");
    vi.stubEnv("RESEND_API_KEY", "re_test");
  });

  it("accepts subscription started test emails", async () => {
    const { POST } = await import("@/app/api/account-test/email/route");

    const response = await POST(
      new Request("https://universe.test/api/account-test/email", {
        method: "POST",
        body: JSON.stringify({
          toEmail: "creator@example.com",
          recipientName: "Creator",
          template: "SUBSCRIPTION_STARTED",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        template: "SUBSCRIPTION_STARTED",
        to: expect.objectContaining({
          email: "creator@example.com",
        }),
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      accepted: true,
      template: "SUBSCRIPTION_STARTED",
      toEmail: "creator@example.com",
    });
  });
});
