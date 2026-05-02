import { describe, expect, it } from "vitest";

import {
  parseProfileUpdateInput,
  parseSelfServiceRoles,
} from "@/server/account/account.validation";

describe("account validation", () => {
  it("normalizes profile update fields", () => {
    expect(
      parseProfileUpdateInput({
        firstName: " Evan ",
        lastName: " Universe ",
        username: "producer_01",
        displayName: " Universe Beats ",
        slug: "universe-beats",
        bio: "",
        city: " Paris ",
        countryCode: "fr",
        isPublic: true,
      }),
    ).toEqual({
      firstName: "Evan",
      lastName: "Universe",
      username: "producer_01",
      displayName: "Universe Beats",
      slug: "universe-beats",
      bio: null,
      city: "Paris",
      countryCode: "FR",
      isPublic: true,
    });
  });

  it("rejects invalid profile payloads", () => {
    expect(() => parseProfileUpdateInput(null)).toThrow("Invalid profile payload.");
    expect(() => parseProfileUpdateInput({ slug: "Bad Slug" })).toThrow("slug is invalid.");
    expect(() => parseProfileUpdateInput({ displayName: "" })).toThrow(
      "displayName cannot be empty.",
    );
    expect(() => parseProfileUpdateInput({ countryCode: "FRA" })).toThrow(
      "countryCode must be a 2-letter ISO code.",
    );
  });

  it("deduplicates and validates self-service roles", () => {
    expect(parseSelfServiceRoles({ roles: [" buyer ", "SELLER", "buyer"] })).toEqual([
      "BUYER",
      "SELLER",
    ]);
  });

  it("rejects roles outside self-service scope", () => {
    expect(() => parseSelfServiceRoles({ roles: [] })).toThrow("At least one role is required.");
    expect(() => parseSelfServiceRoles({ roles: ["ADMIN"] })).toThrow(
      'Role "ADMIN" cannot be self-assigned.',
    );
    expect(() => parseSelfServiceRoles({ roles: ["BUYER", 1] })).toThrow(
      "roles must only contain strings.",
    );
  });
});
