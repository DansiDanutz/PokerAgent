"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui";
import { changePassword, type FormState } from "@/app/actions";

const initial: FormState = {};
const inputCls =
  "w-full rounded-xl bg-felt-900 px-3.5 py-2.5 text-sm text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:ring-emerald-glow/50";

export function ChangePassword() {
  const [state, action, pending] = useActionState(changePassword, initial);
  const ok = state.error === undefined && state !== initial;
  return (
    <form action={action} className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-medium text-ink-200">
        <KeyRound size={15} className="text-emerald-soft" /> Change password
      </p>
      <input name="currentPassword" type="password" autoComplete="current-password" placeholder="Current password" className={inputCls} />
      <input name="newPassword" type="password" autoComplete="new-password" placeholder="New password (min 8 chars)" className={inputCls} />
      {state.error && <p className="text-xs text-[var(--color-danger)]">{state.error}</p>}
      {ok && !pending && <p className="text-xs text-emerald-soft">✓ Password updated.</p>}
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
