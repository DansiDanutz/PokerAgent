import { getCurrentUser } from "@/lib/auth/session";
import { getRepository } from "@/lib/data";
import { Card, Stat, SectionTitle, Badge } from "@/components/ui";
import { WalletActions } from "@/components/wallet/WalletActions";
import { TX_META } from "@/components/wallet/txMeta";
import { formatMoney, formatDate } from "@/lib/format";

export default async function WalletPage() {
  const user = (await getCurrentUser())!;
  const transactions = await getRepository().listTransactions(user.id);

  const pending = transactions
    .filter((t) => t.status === "pending")
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ink-100">Wallet</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Balance" value={formatMoney(user.balance, user.currency)} tone="gold" />
        <Stat label="Pending" value={formatMoney(pending, user.currency)} tone={pending ? "ember" : "default"} />
        <div className="col-span-2 sm:col-span-1">
          <Stat label="Transactions" value={String(transactions.length)} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <WalletActions referralCode={user.referralCode} />

        <Card>
          <SectionTitle title="Transaction history" />
          <ul className="divide-y divide-white/5">
            {transactions.map((tx) => {
              const meta = TX_META[tx.type];
              const Icon = meta.icon;
              return (
                <li key={tx.id} className="flex items-center gap-3 py-3">
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${meta.bg}`}>
                    <Icon size={16} className={meta.color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink-100">{meta.label}</p>
                    <p className="truncate text-xs text-ink-500">{formatDate(tx.createdAt)}{tx.note ? ` · ${tx.note}` : ""}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-semibold ${tx.amount >= 0 ? "text-emerald-soft" : "text-[var(--color-danger)]"}`}>
                      {tx.amount >= 0 ? "+" : "−"}{formatMoney(Math.abs(tx.amount), tx.currency)}
                    </p>
                    <Badge tone={tx.status === "completed" ? "emerald" : tx.status === "pending" ? "warning" : "neutral"}>
                      {tx.status}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
