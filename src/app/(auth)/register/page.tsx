import { Brand } from "@/components/brand";
import { Card } from "@/components/ui";
import { RegisterForm } from "./RegisterForm";

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <Brand size="lg" />
      </div>
      <Card glow="gold" className="p-6">
        <h1 className="text-2xl font-semibold text-ink-100">Create your account</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-400">
          Join with an agent&apos;s invite code to unlock rakeback and network perks.
        </p>
        <div className="mt-6">
          <RegisterForm />
        </div>
      </Card>
      <p className="text-center text-sm text-ink-400">
        Already have an account?{" "}
        <a href="/login" className="font-medium text-emerald-soft underline-offset-4 hover:underline">
          Log in
        </a>
      </p>
    </div>
  );
}
