import { describe, it, expect } from "vitest";
import { formatMoney } from "./format";

describe("formatMoney", () => {
  it("formats whole-dollar minor units with thousands separators", () => {
    expect(formatMoney(150_000)).toBe("$1,500.00");
  });

  it("formats minor units that include cents", () => {
    expect(formatMoney(1_234_56)).toBe("$1,234.56");
  });

  it("formats zero", () => {
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("formats negative amounts with a leading minus sign", () => {
    expect(formatMoney(-150_000)).toBe("-$1,500.00");
  });

  it("rounds sub-cent minor-unit values to two decimal places", () => {
    // 1 minor unit = $0.01, so this exercises the /100 conversion directly.
    expect(formatMoney(1)).toBe("$0.01");
  });

  it("supports a different ISO currency code", () => {
    expect(formatMoney(150_000, "EUR")).toBe("€1,500.00");
  });
});
