import { Brand } from "@/components/brand";
import { Card } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <Brand size="lg" />
      </div>

      <Card glow="gold" className="p-6">
        <h1 className="text-2xl font-semibold text-ink-100">Welcome back</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-400">
          Sign in to manage your players, network and bankroll.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </Card>

      <p className="text-center text-sm text-ink-400">
        New here?{" "}
        <a href="/register" className="font-medium text-emerald-soft underline-offset-4 hover:underline">
          Create your account
        </a>
      </p>
    </div>
  );
}
