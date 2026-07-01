import { describe, it, expect } from "vitest";
import { ADMIN_EMAIL, isAdminEmail } from "./governance";

describe("isAdminEmail", () => {
  it("returns true for an exact match of ADMIN_EMAIL", () => {
    expect(isAdminEmail(ADMIN_EMAIL)).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isAdminEmail(ADMIN_EMAIL.toUpperCase())).toBe(true);
    expect(isAdminEmail("SemeBitcoin@Gmail.com")).toBe(true);
  });

  it("trims leading and trailing whitespace", () => {
    expect(isAdminEmail(`  ${ADMIN_EMAIL}  `)).toBe(true);
    expect(isAdminEmail(`\n${ADMIN_EMAIL}\t`)).toBe(true);
  });

  it("returns false for null, undefined, or empty string", () => {
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });

  it("returns false for a similar but different email", () => {
    expect(isAdminEmail("semebitcoin@gmail.co")).toBe(false);
    expect(isAdminEmail("semebitcoins@gmail.com")).toBe(false);
    expect(isAdminEmail("notsemebitcoin@gmail.com")).toBe(false);
    expect(isAdminEmail("semebitcoin@gmail.com.evil.com")).toBe(false);
  });
});
