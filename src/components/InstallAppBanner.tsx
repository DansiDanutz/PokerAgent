"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

const DISMISSED_KEY = "pa-install-dismissed";

/** Chrome/Edge/Android fire this before showing their native install UI. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own (non-standard) flag for "launched from Home Screen".
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
}

export function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISSED_KEY) === "1") return;

    if (isIos()) {
      setVisible(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      localStorage.setItem(DISMISSED_KEY, "1");
      setVisible(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  };

  const handleInstall = async () => {
    if (isIos()) {
      setShowIosSteps((s) => !s);
      return;
    }
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "accepted") {
      localStorage.setItem(DISMISSED_KEY, "1");
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="border-b border-gold-500/20 bg-gold-500/[0.06] px-4 py-2.5 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-500/15">
          <Download size={15} className="text-gold-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-ink-100">Install Poker Agent</p>
          <p className="truncate text-[11px] text-ink-500">Add it to your home screen for one-tap access.</p>
        </div>
        <button
          onClick={handleInstall}
          className="shrink-0 rounded-lg bg-gradient-to-b from-gold-300 to-gold-500 px-3 py-1.5 text-xs font-semibold text-[#241c05] hover:brightness-105"
        >
          Install app
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-500 hover:bg-white/5 hover:text-ink-200"
        >
          <X size={14} />
        </button>
      </div>

      {showIosSteps && (
        <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-white/[0.04] p-2.5 text-[11px] text-ink-300">
          <Share size={14} className="mt-0.5 shrink-0 text-ink-400" />
          <p>
            Tap the <span className="font-medium text-ink-100">Share</span> icon in Safari, then{" "}
            <span className="font-medium text-ink-100">Add to Home Screen</span>.
          </p>
        </div>
      )}
    </div>
  );
}
