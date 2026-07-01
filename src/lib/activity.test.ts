import { describe, it, expect } from "vitest";
import { DORMANCY_DAYS, daysSinceActive, isDormant } from "./activity";

const NOW = new Date("2026-07-01T00:00:00.000Z");

describe("daysSinceActive", () => {
  it("counts whole days between the timestamp and now", () => {
    expect(daysSinceActive("2026-06-01T00:00:00.000Z", NOW)).toBe(30);
  });

  it("falls back to createdAt when lastActiveAt is missing", () => {
    expect(daysSinceActive(undefined, NOW, "2026-06-01T00:00:00.000Z")).toBe(30);
  });
});

describe("isDormant", () => {
  it("is not dormant just under a year of inactivity", () => {
    const almostAYearAgo = new Date(NOW.getTime() - (DORMANCY_DAYS - 1) * 86_400_000).toISOString();
    expect(isDormant(almostAYearAgo, NOW)).toBe(false);
  });

  it("is dormant at exactly a year of inactivity", () => {
    const exactlyAYearAgo = new Date(NOW.getTime() - DORMANCY_DAYS * 86_400_000).toISOString();
    expect(isDormant(exactlyAYearAgo, NOW)).toBe(true);
  });

  it("is dormant well past a year of inactivity", () => {
    expect(isDormant("2020-01-01T00:00:00.000Z", NOW)).toBe(true);
  });

  it("falls back to createdAt when lastActiveAt was never recorded", () => {
    expect(isDormant(undefined, NOW, "2020-01-01T00:00:00.000Z")).toBe(true);
    expect(isDormant(undefined, NOW, "2026-06-30T00:00:00.000Z")).toBe(false);
  });
});
