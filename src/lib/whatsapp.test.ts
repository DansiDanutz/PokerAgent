import { describe, it, expect } from "vitest";
import { buildWhatsAppInviteLink } from "./whatsapp";

describe("buildWhatsAppInviteLink", () => {
  it("builds a wa.me link with the referral code and app link", () => {
    const url = buildWhatsAppInviteLink("PA-ALEX-77");
    expect(url).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(url).toContain(encodeURIComponent("PA-ALEX-77"));
    expect(url).toContain(encodeURIComponent("https://pokeragent.app/r/PA-ALEX-77"));
  });

  it("percent-encodes the message so it's a valid URL", () => {
    const url = buildWhatsAppInviteLink("PA-ALEX-77");
    expect(url).not.toContain(" ");
  });
});
