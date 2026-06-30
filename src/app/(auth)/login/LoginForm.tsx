"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { loginAction, type FormState } from "@/app/actions";

const initial: FormState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-400">Username or email</span>
        <input
          name="identifier"
          autoComplete="username"
          placeholder="arjunmehta"
          className="w-full rounded-xl bg-felt-900 px-3.5 py-2.5 text-sm text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:ring-emerald-glow/50"
        />
      </label>
      {state.error && (
        <p className="text-xs text-[var(--color-danger)]" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Log In"}
      </Button>
    </form>
  );
}
