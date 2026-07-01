/**
 * ClubGG "Club Data" export parser.
 *
 * ClubGG has no management API — the club owner exports a CSV from the app
 * (club lobby → Data → Export), which is the only machine-readable source of
 * play statistics. This module turns that CSV into clean, typed rows that the
 * rest of Poker Agent (rakeback + agent-commission distribution) can consume.
 *
 * WHY IT'S HEADER-DRIVEN, NOT FIXED-POSITION
 * ClubGG's exact column names/order aren't publicly documented and vary by
 * which report categories the owner selects (Club Overview, Members
 * Statistics, Club Member Balance, …). So this parser maps columns by a
 * tolerant set of header ALIASES rather than by position. When we get a real
 * export, finalizing the parser is just adding the real header strings to
 * COLUMN_ALIASES — no structural change.
 *
 * SCOPE: pure parsing + normalization only. It does not mutate any balance,
 * hit the database, or compute distributions — those layers build on top of
 * the normalized rows this returns.
 *
 * All money values are normalized to minor units (integer cents) to match the
 * rest of the ledger; hands are integers; hours are decimals (may be absent —
 * ClubGG is hands/rake-based and may not report time).
 */

/** One member's play statistics for the export period, normalized. */
export interface ClubggMemberStats {
  /** ClubGG member id — the join key to pa_profiles.clubgg_id. */
  clubggId: string;
  /** Display nickname, if the export includes it. */
  nickname?: string;
  /** The member's agent as ClubGG reports it (id or nickname) — used to reconcile the tree. */
  agentRef?: string;
  handsPlayed: number;
  /** Rake generated, in minor units (cents). */
  rake: number;
  /** Buy-ins / money in, in minor units. */
  buyIn: number;
  /** Cash-outs / money out, in minor units. */
  cashOut: number;
  /** Profit/loss in minor units. Uses the file's value if present, else cashOut − buyIn. */
  profitLoss: number;
  /** Table hours, if the export provides them (often absent in ClubGG). */
  hours?: number;
}

/** The fields we know how to fill, used as the internal mapping target. */
type Field = "clubggId" | "nickname" | "agentRef" | "handsPlayed" | "rake" | "buyIn" | "cashOut" | "profitLoss" | "hours";

// Normalize a header cell (or an alias key) to its lookup form: lowercase,
// alphanumerics only — so "Member ID", "member_id", and "MemberID" all collide.
function headerKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Recognized header names → normalized field. Keys MUST already be in
 * headerKey() form (lowercase alphanumerics). Extend this with the real
 * ClubGG headers once we have an export; unknown columns are simply ignored.
 */
const COLUMN_ALIASES: Record<string, Field> = {
  // identity
  memberid: "clubggId",
  clubggid: "clubggId",
  userid: "clubggId",
  playerid: "clubggId",
  id: "clubggId",
  nickname: "nickname",
  name: "nickname",
  username: "nickname",
  // tree
  agent: "agentRef",
  agentid: "agentRef",
  agentname: "agentRef",
  upline: "agentRef",
  // play
  hands: "handsPlayed",
  handsplayed: "handsPlayed",
  handcount: "handsPlayed",
  hours: "hours",
  hoursplayed: "hours",
  playtime: "hours",
  // money
  rake: "rake",
  rakegenerated: "rake",
  fee: "rake",
  totalrake: "rake",
  buyin: "buyIn",
  buyins: "buyIn",
  totalbuyin: "buyIn",
  moneyin: "buyIn",
  cashout: "cashOut",
  cashouts: "cashOut",
  totalcashout: "cashOut",
  moneyout: "cashOut",
  profitloss: "profitLoss",
  pl: "profitLoss",
  winloss: "profitLoss",
  net: "profitLoss",
};

/**
 * Parse one CSV line into cells, honoring double-quoted fields (which may
 * contain commas and escaped "" quotes). Good enough for spreadsheet exports.
 */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/**
 * Parse a money string to integer minor units (cents). Handles currency
 * symbols, thousands separators, and parentheses-as-negative — e.g.
 * "$1,234.50" → 123450, "(50.00)" → -5000, "" → 0.
 */
export function parseMoneyToCents(raw: string | undefined): number {
  if (!raw) return 0;
  let s = raw.trim();
  if (!s) return 0;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/[^0-9.]/g, ""); // drop currency symbols, thousands separators, spaces
  if (!s) return 0;
  const value = Number(s);
  if (!Number.isFinite(value)) return 0;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/** Parse an integer count (hands), tolerant of separators. Returns 0 on garbage. */
export function parseCount(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw.replace(/[^0-9-]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Parse a decimal (hours). Returns undefined when the column is absent/blank. */
function parseDecimalOrUndefined(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const s = raw.replace(/[^0-9.-]/g, "");
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export interface ClubggParseResult {
  rows: ClubggMemberStats[];
  /** Non-fatal issues (unmapped required columns, skipped rows, …) surfaced to the admin. */
  warnings: string[];
}

/**
 * Parse a ClubGG Club Data CSV into normalized per-member statistics.
 * Requires at least a recognizable member-id column and a header row; rows
 * without a member id are skipped (with a warning) rather than guessed.
 */
export function parseClubggStats(csv: string): ClubggParseResult {
  const warnings: string[] = [];
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], warnings: ["The file is empty."] };

  const header = parseCsvLine(lines[0]);
  const colIndex: Partial<Record<Field, number>> = {};
  header.forEach((h, idx) => {
    const field = COLUMN_ALIASES[headerKey(h)];
    if (field && !(field in colIndex)) colIndex[field] = idx;
  });

  if (colIndex.clubggId === undefined) {
    warnings.push(
      "No member-id column recognized (looked for member_id / clubgg_id / player_id / id). " +
        "Add the real ClubGG header to COLUMN_ALIASES.",
    );
    return { rows: [], warnings };
  }
  for (const required of ["rake", "handsPlayed"] as const) {
    if (colIndex[required] === undefined) {
      warnings.push(`No "${required}" column recognized — that value will default to 0 for every row.`);
    }
  }

  const at = (cells: string[], field: Field): string | undefined => {
    const idx = colIndex[field];
    return idx === undefined ? undefined : cells[idx];
  };

  const rows: ClubggMemberStats[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const clubggId = at(cells, "clubggId")?.trim();
    if (!clubggId) {
      warnings.push(`Row ${i + 1}: no member id — skipped.`);
      continue;
    }
    const buyIn = parseMoneyToCents(at(cells, "buyIn"));
    const cashOut = parseMoneyToCents(at(cells, "cashOut"));
    const explicitPl = at(cells, "profitLoss");
    rows.push({
      clubggId,
      nickname: at(cells, "nickname")?.trim() || undefined,
      agentRef: at(cells, "agentRef")?.trim() || undefined,
      handsPlayed: parseCount(at(cells, "handsPlayed")),
      rake: parseMoneyToCents(at(cells, "rake")),
      buyIn,
      cashOut,
      // Prefer the file's own P/L column; otherwise derive it.
      profitLoss: explicitPl !== undefined && explicitPl !== "" ? parseMoneyToCents(explicitPl) : cashOut - buyIn,
      hours: parseDecimalOrUndefined(at(cells, "hours")),
    });
  }

  if (rows.length === 0) warnings.push("No data rows found after the header.");
  return { rows, warnings };
}
