"use client";

import { useActionState } from "react";
import { Upload, Download, FileSpreadsheet } from "lucide-react";
import { Card, SectionTitle, Button } from "@/components/ui";
import { importRoster, type ImportResult } from "@/app/actions";
import type { AdminUserRow } from "./AdminUserManager";

const SAMPLE = "username,full_name,email,upline_code,clubgg_id,balance\njdoe,John Doe,jdoe@mail.com,PAGENT-ARJUN12,9001234,100";

/**
 * Escape one CSV cell safely. Beyond normal quoting, this neutralizes
 * spreadsheet **formula injection**: a cell starting with =, +, -, @, tab, or
 * CR is executed as a formula by Excel/Sheets when the file is opened. Since
 * usernames and full names are user-controlled, a member named e.g.
 * `=HYPERLINK(...)` would otherwise run in the admin's spreadsheet. Prefixing
 * such cells with a single quote makes them inert text.
 */
function csvCell(value: unknown): string {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(users: AdminUserRow[]): string {
  // `upline` holds the agent's INVITE CODE (not the internal id) so the sheet
  // round-trips through Import, which links members by invite code. `upline_name`
  // is the agent's username, purely for human readability when reconciling.
  const header =
    "username,full_name,email,role,kyc_status,status,clubgg_id,upline,upline_name,balance_usd,rake_usd";
  const rows = users.map((u) =>
    [
      u.username,
      u.fullName,
      u.email,
      u.role,
      u.kycStatus,
      u.status,
      u.clubggId ?? "",
      u.uplineReferralCode ?? "",
      u.uplineUsername ?? "",
      (u.balance / 100).toFixed(2),
      (u.rake / 100).toFixed(2),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

const initial: ImportResult = {};

export function RosterTools({ users }: { users: AdminUserRow[] }) {
  const [state, action, pending] = useActionState(importRoster, initial);

  const exportCsv = () => {
    const blob = new Blob([toCsv(users)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pokeragent-roster-${users.length}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <SectionTitle
        title="Roster import / export"
        subtitle="Bulk-load members or export a reconciliation sheet for ClubGG"
        action={
          <Button variant="ghost" onClick={exportCsv}>
            <Download size={15} /> Export CSV
          </Button>
        }
      />
      <form action={action} className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-medium text-ink-400">
          <FileSpreadsheet size={14} /> Paste CSV rows
          <span className="text-ink-500">(username, full_name, email, upline_code, clubgg_id, balance)</span>
        </label>
        <textarea
          name="csv"
          rows={5}
          defaultValue=""
          placeholder={SAMPLE}
          className="w-full rounded-xl bg-felt-900 px-3.5 py-2.5 font-mono text-xs text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-600 focus:ring-emerald-glow/50"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-ink-500">First row may be a header. Upline = an agent&apos;s invite code.</p>
          <Button type="submit" disabled={pending}>
            <Upload size={15} /> {pending ? "Importing…" : "Import members"}
          </Button>
        </div>
      </form>

      {state.error && <p className="mt-2 text-xs text-[var(--color-danger)]">{state.error}</p>}
      {state.created !== undefined && (
        <div className="mt-3 rounded-xl bg-white/[0.03] p-3 text-sm ring-1 ring-inset ring-white/5">
          <p className="text-emerald-soft">✓ Imported {state.created} member{state.created === 1 ? "" : "s"}.</p>
          {state.errors && state.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-[var(--color-warning)]">
              {state.errors.slice(0, 8).map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
              {state.errors.length > 8 && <li>…and {state.errors.length - 8} more</li>}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
