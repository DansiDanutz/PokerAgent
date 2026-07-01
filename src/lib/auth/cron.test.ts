import { describe, it, expect, afterEach, vi } from "vitest";
import { authorizedCronRequest } from "./cron";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

function requestWithAuth(header?: string): Request {
  const headers = new Headers();
  if (header !== undefined) headers.set("authorization", header);
  return new Request("https://example.com/api/cron/tick", { headers });
}

afterEach(() => {
  if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  vi.unstubAllEnvs();
});

describe("authorizedCronRequest", () => {
  it("authorizes when no CRON_SECRET is set and NODE_ENV is not production", () => {
    delete process.env.CRON_SECRET;
    vi.stubEnv("NODE_ENV", "development");

    expect(authorizedCronRequest(requestWithAuth())).toBe(true);
  });

  it("does NOT authorize when no CRON_SECRET is set and NODE_ENV is production", () => {
    delete process.env.CRON_SECRET;
    vi.stubEnv("NODE_ENV", "production");

    expect(authorizedCronRequest(requestWithAuth())).toBe(false);
  });

  it("authorizes when CRON_SECRET is set and the Authorization header matches", () => {
    process.env.CRON_SECRET = "top-secret-value";
    vi.stubEnv("NODE_ENV", "production");

    expect(authorizedCronRequest(requestWithAuth("Bearer top-secret-value"))).toBe(true);
  });

  it("does NOT authorize when CRON_SECRET is set and the header value is wrong", () => {
    process.env.CRON_SECRET = "top-secret-value";
    vi.stubEnv("NODE_ENV", "production");

    expect(authorizedCronRequest(requestWithAuth("Bearer wrong-value"))).toBe(false);
  });

  it("does NOT authorize when CRON_SECRET is set and no header is present", () => {
    process.env.CRON_SECRET = "top-secret-value";
    vi.stubEnv("NODE_ENV", "production");

    expect(authorizedCronRequest(requestWithAuth())).toBe(false);
  });

  it("does NOT authorize (and does not throw) when the header length differs from expected", () => {
    process.env.CRON_SECRET = "top-secret-value";
    vi.stubEnv("NODE_ENV", "production");

    // Shorter than "Bearer top-secret-value" — would make timingSafeEqual
    // throw on a raw length mismatch if the length guard weren't in place.
    expect(() => authorizedCronRequest(requestWithAuth("Bearer short"))).not.toThrow();
    expect(authorizedCronRequest(requestWithAuth("Bearer short"))).toBe(false);

    // Longer than expected too.
    expect(
      authorizedCronRequest(requestWithAuth("Bearer top-secret-value-with-extra-suffix"))
    ).toBe(false);
  });

  it("does NOT authorize a completely empty Authorization header", () => {
    process.env.CRON_SECRET = "top-secret-value";
    vi.stubEnv("NODE_ENV", "production");

    expect(authorizedCronRequest(requestWithAuth(""))).toBe(false);
  });
});
