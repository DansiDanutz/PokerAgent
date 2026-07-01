"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function GoogleButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setPending(true);
    setError(null);

    // Open the tab synchronously, inside the click gesture, so browsers don't
    // treat it as an unsolicited popup once we `await` below. Google also
    // refuses to render its consent screen inside an iframe/sandboxed preview
    // ("disallowed_useragent"), so a real top-level tab is the only thing
    // that reliably works here regardless of what's hosting this page.
    const authTab = window.open("", "_blank");

    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
        },
      });
      if (oauthError || !data?.url) {
        authTab?.close();
        setError(oauthError?.message ?? "Could not start Google sign-in");
        setPending(false);
        return;
      }
      if (authTab) {
        authTab.location.href = data.url;
      } else {
        // Popup blocked outright — fall back to redirecting this tab.
        window.location.href = data.url;
      }
      setPending(false);
    } catch (e) {
      authTab?.close();
      setError(e instanceof Error ? e.message : "Could not start Google sign-in");
      setPending(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-medium text-ink-100 ring-1 ring-inset ring-white/10 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <GoogleIcon />
        {pending ? "Redirecting…" : "Continue with Google"}
      </button>
      {error && <p className="text-xs text-[var(--color-danger)]" role="alert">{error}</p>}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.87-3.04.87-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.73a5.4 5.4 0 0 1 0-3.46V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}
