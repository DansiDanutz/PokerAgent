"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { registerAction, type FormState } from "@/app/actions";

const initial: FormState = {};

const inputCls =
  "w-full rounded-xl bg-felt-900 px-3.5 py-2.5 text-sm text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:ring-emerald-glow/50";

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initial);
  return (
    <form action={action} className="space-y-3">
      <Field name="fullName" label="Full name" placeholder="Alex Player" autoComplete="name" />
      <Field name="username" label="Username" placeholder="alexplayer" autoComplete="username" />
      <Field name="email" label="Email" placeholder="alex@email.com" type="email" autoComplete="email" />
      <Field name="password" label="Password" placeholder="At least 8 characters" type="password" autoComplete="new-password" />
      <Field name="referralCode" label="Invite code (optional)" placeholder="PAGENT-ARJUN12" />
      {state.error && (
        <p className="text-xs text-[var(--color-danger)]" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create account"}
      </Button>
      <p className="text-center text-[11px] text-ink-500">
        By continuing you agree to play responsibly. 18+.
      </p>
    </form>
  );
}

function Field({
  name,
  label,
  ...props
}: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-400">{label}</span>
      <input name={name} className={inputCls} {...props} />
    </label>
  );
}
