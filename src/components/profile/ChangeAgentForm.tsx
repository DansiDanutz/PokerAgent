"use client";

import { useActionState } from "react";
import { Repeat } from "lucide-react";
import { Button } from "@/components/ui";
import { changeUplineAction, type FormState } from "@/app/actions";

const initial: FormState = {};
const inputCls =
  "w-full rounded-xl bg-felt-900 px-3.5 py-2.5 text-sm text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:ring-emerald-glow/50";

export function ChangeAgentForm() {
  const [state, action, pending] = useActionState(changeUplineAction, initial);
  const ok = state.error === undefined && state !== initial;
  return (
    <form action={action} className="space-y-2">
      <input
        name="newReferralCode"
        placeholder="New agent's invite code"
        className={inputCls}
        required
      />
      {state.error && <p className="text-xs text-[var(--color-danger)]" role="alert">{state.error}</p>}
      {ok && !pending && <p className="text-xs text-emerald-soft">✓ You're now with your new agent.</p>}
      <Button type="submit" variant="ember" disabled={pending}>
        <Repeat size={15} />
        {pending ? "Switching…" : "Switch agent"}
      </Button>
    </form>
  );
}
