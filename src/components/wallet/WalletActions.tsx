"use client";

import { useActionState, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, SendHorizontal, QrCode } from "lucide-react";
import { clsx } from "clsx";
import { Card, Button } from "@/components/ui";
import { recordCash, transferAction, type FormState } from "@/app/actions";

type Tab = "deposit" | "payback" | "send" | "receive";

const inputCls =
  "w-full rounded-xl bg-felt-900 px-3.5 py-2.5 text-sm text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:ring-emerald-glow/50";

export function WalletActions({ referralCode }: { referralCode: string }) {
  const [tab, setTab] = useState<Tab>("deposit");
  const tabs: { id: Tab; label: string; icon: typeof ArrowDownToLine }[] = [
    { id: "deposit", label: "Deposit", icon: ArrowDownToLine },
    { id: "payback", label: "Pay back", icon: ArrowUpFromLine },
    { id: "send", label: "Send", icon: SendHorizontal },
    { id: "receive", label: "Receive", icon: QrCode },
  ];

  return (
    <Card>
      <div className="mb-4 grid grid-cols-4 gap-1 rounded-xl bg-felt-900 p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                "flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-medium transition",
                tab === t.id ? "bg-emerald-glow/15 text-emerald-soft" : "text-ink-400 hover:text-ink-200",
              )}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "deposit" && <CashForm />}
      {tab === "payback" && <PaybackForm />}
      {tab === "send" && <TransferForm />}
      {tab === "receive" && <Receive code={referralCode} />}
    </Card>
  );
}

function CashForm() {
  return (
    <form action={recordCash} className="space-y-3">
      <input type="hidden" name="type" value="deposit" />
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-400">Amount (USD)</span>
        <input name="amount" type="number" min="1" step="0.01" placeholder="100.00" className={inputCls} required />
      </label>
      <p className="text-xs text-ink-500">
        Deposit requests are reviewed by your agent or an admin before crediting.
      </p>
      <Button type="submit" className="w-full" variant="primary">
        Request deposit
      </Button>
    </form>
  );
}

const initial: FormState = {};

function TransferForm() {
  const [state, action, pending] = useActionState(transferAction, initial);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-400">Recipient invite code</span>
        <input name="toReferralCode" placeholder="PA-SARA-21" className={inputCls} required />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-400">Amount (USD)</span>
        <input name="amount" type="number" min="0.01" step="0.01" placeholder="50.00" className={inputCls} required />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-400">Message (optional)</span>
        <input name="note" placeholder="Good luck at the tables!" className={inputCls} />
      </label>
      {state.error && <p className="text-xs text-[var(--color-danger)]" role="alert">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send money"}
      </Button>
    </form>
  );
}

function PaybackForm() {
  const [state, action, pending] = useActionState(transferAction, initial);
  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-400">Agent code</span>
        <input name="toReferralCode" placeholder="PAGENT-ARJUN12" className={inputCls} required />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-400">Amount (USD)</span>
        <input name="amount" type="number" min="0.01" step="0.01" placeholder="50.00" className={inputCls} required />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-400">Message (optional)</span>
        <input name="note" placeholder="Cashing out from tonight's session" className={inputCls} />
      </label>
      <p className="text-xs text-ink-500">
        Sends chips straight to any agent — settles instantly, no approval needed. Use this to
        cash out chips you received from an agent, even if it isn&apos;t the one who sent them.
      </p>
      {state.error && <p className="text-xs text-[var(--color-danger)]" role="alert">{state.error}</p>}
      <Button type="submit" className="w-full" variant="gold" disabled={pending}>
        {pending ? "Sending…" : "Pay back agent"}
      </Button>
    </form>
  );
}

function Receive({ code }: { code: string }) {
  const payload = `https://pokeragent.app/r/${code}`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&bgcolor=0e1813&color=e9c46a&data=${encodeURIComponent(payload)}`;
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <div className="rounded-2xl bg-felt-900 p-4 gold-ring">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={`QR code for ${code}`} width={180} height={180} className="rounded-lg" />
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-400">Your receive code</p>
        <p className="mt-1 text-xl font-semibold tracking-wider gold-text">{code}</p>
      </div>
      <p className="max-w-xs text-xs text-ink-500">
        Share this code or QR so other players can send you chips instantly.
      </p>
    </div>
  );
}
