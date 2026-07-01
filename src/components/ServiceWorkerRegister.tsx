"use client";

import { useEffect } from "react";

/** Registers the no-op service worker so the app qualifies as installable. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installability is best-effort — a failed registration shouldn't
        // block the rest of the app.
      });
    }
  }, []);

  return null;
}
