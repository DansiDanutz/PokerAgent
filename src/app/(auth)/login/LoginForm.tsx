"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { loginAction, type FormState } from "@/app/actions";
import { DEMO_LOGINS, SEED_PASSWORD } from "@/lib/data/seed";

const initial: FormState = {};
const inputCls =
  "w-full rounded-xl bg-felt-900 px-3.5 py-2.5 text-sm text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:ring-emerald-glow/50";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const tryAs = (email: string) => {
    if (emailRef.current) emailRef.current.value = email;
    if (passwordRef.current) passwordRef.current.value = SEED_PASSWORD;
    formRef.current?.requestSubmit();
  };

  return (
    <div className="space-y-4">
      <form ref={formRef} action={action} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-400">Email</span>
          <input ref={emailRef} name="email" type="email" autoComplete="email" placeholder="you@email.com" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-400">Password</span>
          <input ref={passwordRef} name="password" type="password" autoComplete="current-password" placeholder="••••••••" className={inputCls} />
        </label>
        {state.error && (
          <p className="text-xs text-[var(--color-danger)]" role="alert">{state.error}</p>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Log In"}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-ink-500">
        <span className="h-px flex-1 bg-white/10" />
        Or continue with
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <GoogleButton />

      <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-ink-500">
        <span className="h-px flex-1 bg-white/10" />
        Quick demo access
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <div className="flex items-center gap-2">
        {DEMO_LOGINS.map((d) => (
          <button
            key={d.email}
            onClick={() => tryAs(d.email)}
            className="flex-1 rounded-xl bg-white/5 px-2 py-2.5 text-center text-xs font-medium text-ink-200 ring-1 ring-inset ring-white/10 transition hover:bg-white/10 hover:ring-white/20"
          >
            Try as {d.label}
          </button>
        ))}
      </div>
      <p className="text-center text-[11px] text-ink-500">Demo accounts use a shared password.</p>
    </div>
  );
}
