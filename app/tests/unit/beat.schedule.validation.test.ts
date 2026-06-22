import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseScheduleBeatInput } from "@/server/beats/beat.validation";

describe("parseScheduleBeatInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a valid future date", () => {
    const { scheduledPublishAt } = parseScheduleBeatInput({
      scheduledPublishAt: "2026-06-23T12:00:00.000Z",
    });

    expect(scheduledPublishAt.toISOString()).toBe("2026-06-23T12:00:00.000Z");
  });

  it("rejects a non-object payload", () => {
    expect(() => parseScheduleBeatInput(null)).toThrow("schedule_payload_invalid");
    expect(() => parseScheduleBeatInput([])).toThrow("schedule_payload_invalid");
  });

  it("rejects a missing or non-string date", () => {
    expect(() => parseScheduleBeatInput({})).toThrow("scheduled_publish_at_required");
    expect(() => parseScheduleBeatInput({ scheduledPublishAt: 123 })).toThrow(
      "scheduled_publish_at_required",
    );
  });

  it("rejects an unparseable date", () => {
    expect(() => parseScheduleBeatInput({ scheduledPublishAt: "not-a-date" })).toThrow(
      "scheduled_publish_at_invalid",
    );
  });

  it("rejects a date within the lead margin (effectively in the past)", () => {
    expect(() =>
      parseScheduleBeatInput({ scheduledPublishAt: "2026-06-22T12:00:30.000Z" }),
    ).toThrow("scheduled_publish_at_in_past");
  });

  it("rejects a date beyond the one-year horizon", () => {
    expect(() =>
      parseScheduleBeatInput({ scheduledPublishAt: "2027-06-23T12:00:00.000Z" }),
    ).toThrow("scheduled_publish_at_too_far");
  });
});
