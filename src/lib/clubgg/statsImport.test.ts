import { describe, it, expect } from "vitest";
import { parseClubggStats, parseMoneyToCents, parseCount, parseCsvLine } from "./statsImport";

describe("parseMoneyToCents", () => {
  it("converts a plain decimal to integer cents", () => {
    expect(parseMoneyToCents("12.34")).toBe(1234);
  });

  it("strips currency symbols and thousands separators", () => {
    expect(parseMoneyToCents("$1,234.50")).toBe(123450);
  });

  it("treats parentheses as negative", () => {
    expect(parseMoneyToCents("(50.00)")).toBe(-5000);
  });

  it("treats a leading minus as negative", () => {
    expect(parseMoneyToCents("-7.5")).toBe(-750);
  });

  it("returns 0 for blank or missing input", () => {
    expect(parseMoneyToCents("")).toBe(0);
    expect(parseMoneyToCents(undefined)).toBe(0);
  });

  it("rounds to the nearest cent", () => {
    expect(parseMoneyToCents("0.005")).toBe(1); // 0.5 cents rounds up
    expect(parseMoneyToCents("0.004")).toBe(0);
  });
});

describe("parseCount", () => {
  it("parses an integer hand count with separators", () => {
    expect(parseCount("1,240")).toBe(1240);
  });

  it("returns 0 for garbage", () => {
    expect(parseCount("n/a")).toBe(0);
    expect(parseCount(undefined)).toBe(0);
  });
});

describe("parseCsvLine", () => {
  it("honors quoted fields containing commas", () => {
    expect(parseCsvLine('a,"b, c",d')).toEqual(["a", "b, c", "d"]);
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    expect(parseCsvLine('"he said ""hi""",x')).toEqual(['he said "hi"', "x"]);
  });
});

describe("parseClubggStats", () => {
  it("parses a standard export into normalized rows", () => {
    const csv = [
      "member_id,nickname,agent,hands,rake,buy_in,cash_out",
      "8842014,alexplayer,PAGENT-ARJUN12,1240,21.50,500.00,715.50",
      "8842027,saralin,PAGENT-ARJUN12,912,8.80,600.00,642.00",
    ].join("\n");

    const { rows, warnings } = parseClubggStats(csv);

    expect(warnings).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      clubggId: "8842014",
      nickname: "alexplayer",
      agentRef: "PAGENT-ARJUN12",
      handsPlayed: 1240,
      rake: 2150,
      buyIn: 50000,
      cashOut: 71550,
      profitLoss: 21550, // derived: cashOut − buyIn
      hours: undefined,
    });
  });

  it("uses an explicit profit/loss column when present instead of deriving it", () => {
    const csv = ["member_id,rake,hands,profit_loss", "8842041,6.90,760,(120.00)"].join("\n");
    const { rows } = parseClubggStats(csv);
    expect(rows[0].profitLoss).toBe(-12000);
  });

  it("tolerates alternative header spellings and casing", () => {
    const csv = ["Player ID,Total Rake,Hand Count,Win/Loss", "8842055,1.90,210,-3.20"].join("\n");
    const { rows, warnings } = parseClubggStats(csv);
    expect(warnings).toEqual([]);
    expect(rows[0].clubggId).toBe("8842055");
    expect(rows[0].rake).toBe(190);
    expect(rows[0].handsPlayed).toBe(210);
    expect(rows[0].profitLoss).toBe(-320);
  });

  it("captures hours when the export provides them", () => {
    const csv = ["member_id,rake,hands,hours", "8842014,21.50,1240,6.5"].join("\n");
    expect(parseClubggStats(csv).rows[0].hours).toBe(6.5);
  });

  it("warns and returns nothing when no member-id column is recognized", () => {
    const csv = ["foo,bar,baz", "1,2,3"].join("\n");
    const { rows, warnings } = parseClubggStats(csv);
    expect(rows).toHaveLength(0);
    expect(warnings.join(" ")).toMatch(/no member-id column/i);
  });

  it("skips rows without a member id and warns", () => {
    const csv = ["member_id,rake,hands", "8842014,21.50,1240", ",5.00,100"].join("\n");
    const { rows, warnings } = parseClubggStats(csv);
    expect(rows).toHaveLength(1);
    expect(warnings.join(" ")).toMatch(/row 3.*skipped/i);
  });

  it("warns when rake or hands columns are missing, defaulting them to 0", () => {
    const csv = ["member_id,buy_in,cash_out", "8842014,500.00,715.50"].join("\n");
    const { rows, warnings } = parseClubggStats(csv);
    expect(rows[0].rake).toBe(0);
    expect(rows[0].handsPlayed).toBe(0);
    expect(warnings.join(" ")).toMatch(/rake/i);
    expect(warnings.join(" ")).toMatch(/handsPlayed/i);
  });

  it("returns a helpful warning for an empty file", () => {
    expect(parseClubggStats("").warnings.join(" ")).toMatch(/empty/i);
  });
});

describe("parseClubggStats — per-table metadata", () => {
  it("captures table name and game type from per-table (Game Detail) reports", () => {
    const csv = ["member_id,table name,game type,hands,rake", "8842014,NLH 1/2 Table 5,NLH,320,4.20"].join("\n");
    const { rows } = parseClubggStats(csv);
    expect(rows[0].tableName).toBe("NLH 1/2 Table 5");
    expect(rows[0].gameType).toBe("NLH");
  });

  it("leaves table/game undefined when the report doesn't carry them", () => {
    const csv = ["member_id,rake,hands", "8842014,21.50,1240"].join("\n");
    const { rows } = parseClubggStats(csv);
    expect(rows[0].tableName).toBeUndefined();
    expect(rows[0].gameType).toBeUndefined();
  });
});
