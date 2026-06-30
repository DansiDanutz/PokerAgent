import { clsx } from "clsx";

/** The spade emblem + wordmark used across auth and the app shell. */
export function Brand({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dim = size === "lg" ? 44 : size === "sm" ? 26 : 34;
  return (
    <div className="flex items-center gap-3">
      <SpadeMark size={dim} />
      <div className="leading-none">
        <p
          className={clsx(
            "font-semibold tracking-[0.18em] gold-text",
            size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-lg",
          )}
        >
          POKER AGENT
        </p>
        {size !== "sm" && (
          <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-ink-500">
            AI-Powered Poker Assistant
          </p>
        )}
      </div>
    </div>
  );
}

export function SpadeMark({ size = 34 }: { size?: number }) {
  return (
    <div
      className="grid place-items-center rounded-xl bg-felt-800 gold-ring"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size * 0.6}
        height={size * 0.6}
        aria-hidden
        fill="url(#gold)"
      >
        <defs>
          <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f3d89b" />
            <stop offset="1" stopColor="#d4af37" />
          </linearGradient>
        </defs>
        <path d="M12 2C9 6 4 8.5 4 13a4 4 0 0 0 6.5 3.1c-.2 1.7-.9 2.9-1.9 3.9h6.8c-1-.99-1.7-2.2-1.9-3.9A4 4 0 0 0 20 13c0-4.5-5-7-8-11Z" />
      </svg>
    </div>
  );
}

export function Tagline() {
  return (
    <p className="text-center text-xs uppercase tracking-[0.4em] text-gold-500/70">
      ♠ Play Smart. Stay Ahead. ♠
    </p>
  );
}
