import { Brand } from "@/components/brand";
import { Card } from "@/components/ui";
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

      <p className="text-center text-sm text-ink-400">
        New here?{" "}
        <a href="/register" className="font-medium text-emerald-soft hover:underline">
          Create your account
        </a>
      </p>
    </div>
  );
}
