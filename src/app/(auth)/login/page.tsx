import { Brand } from "@/components/brand";
import { Card } from "@/components/ui";
import { DEMO_LOGINS } from "@/lib/data/seed";
import { loginAs } from "@/app/actions";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <Brand size="lg" />
      </div>

      <Card>
        <h1 className="text-xl font-semibold text-ink-100">Welcome back</h1>
        <p className="mt-1 text-sm text-ink-400">
          Sign in to manage your players, network and bankroll.
        </p>
        <div className="mt-5">
          <LoginForm />
        </div>
      </Card>

      <Card glow="gold">
        <p className="text-sm font-medium text-gold-300">Explore each perspective</p>
        <p className="mt-1 text-xs text-ink-400">
          One click to sign in as a player, an agent, or the admin — no password needed in the demo.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {DEMO_LOGINS.map((d) => (
            <form key={d.userId} action={loginAs.bind(null, d.userId)}>
              <button
                type="submit"
                className="w-full rounded-xl bg-white/5 px-2 py-3 text-center ring-1 ring-inset ring-white/10 transition hover:bg-white/10"
              >
                <span className="block text-sm font-semibold text-ink-100">{d.label}</span>
                <span className="block text-[11px] text-ink-500">@{d.hint}</span>
              </button>
            </form>
          ))}
        </div>
      </Card>

      <p className="text-center text-sm text-ink-400">
        New here?{" "}
        <a href="/register" className="font-medium text-emerald-soft hover:underline">
          Create your account
        </a>
      </p>
    </div>
  );
}
