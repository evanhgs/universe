import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const getCurrentAccountSnapshotMock = vi.fn();
const updateCurrentAccountProfileMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/server/account/account.service", () => ({
  getCurrentAccountSnapshot: getCurrentAccountSnapshotMock,
  updateCurrentAccountProfile: updateCurrentAccountProfileMock,
}));

describe("account profile API route", () => {
  beforeEach(() => {
    authMock.mockReset();
    getCurrentAccountSnapshotMock.mockReset();
    updateCurrentAccountProfileMock.mockReset();
  });

  it("returns 401 when PATCH is unauthenticated", async () => {
    authMock.mockResolvedValue({ isAuthenticated: false });
    const { PATCH } = await import("@/app/api/account/me/profile/route");

    const response = await PATCH(new Request("https://example.com/api/account/me/profile"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 400 for invalid profile payloads", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "user_123" });
    const { PATCH } = await import("@/app/api/account/me/profile/route");

    const response = await PATCH(
      new Request("https://example.com/api/account/me/profile", {
        method: "PATCH",
        body: JSON.stringify({ slug: "Bad Slug" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "invalid_profile_update",
      message: "slug is invalid.",
    });
    expect(updateCurrentAccountProfileMock).not.toHaveBeenCalled();
  });

  it("updates the profile with normalized input when authenticated", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "user_123" });
    updateCurrentAccountProfileMock.mockResolvedValue({ ok: true });
    const { PATCH } = await import("@/app/api/account/me/profile/route");

    const response = await PATCH(
      new Request("https://example.com/api/account/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: " Universe ",
          slug: "universe",
          countryCode: "fr",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(updateCurrentAccountProfileMock).toHaveBeenCalledWith("user_123", {
      displayName: "Universe",
      slug: "universe",
      countryCode: "FR",
    });
    expect(await response.json()).toEqual({ ok: true });
  });
});
