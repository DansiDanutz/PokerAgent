import {
  ArrowDownToLine,
  ArrowUpFromLine,
  SendHorizontal,
  Gift,
  Sliders,
  Banknote,
  type LucideIcon,
} from "lucide-react";
import type { TransactionType } from "@/types/domain";

export interface TxMeta {
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
}

export const TX_META: Record<TransactionType, TxMeta> = {
  deposit: { label: "Deposit", icon: ArrowDownToLine, color: "text-emerald-soft", bg: "bg-emerald-glow/15" },
  withdrawal: { label: "Withdrawal", icon: ArrowUpFromLine, color: "text-[var(--color-danger)]", bg: "bg-[var(--color-danger)]/15" },
  transfer_in: { label: "Transfer in", icon: SendHorizontal, color: "text-emerald-soft", bg: "bg-emerald-glow/15" },
  transfer_out: { label: "Transfer out", icon: SendHorizontal, color: "text-gold-300", bg: "bg-gold-500/15" },
  rake_rebate: { label: "Rakeback", icon: Gift, color: "text-gold-300", bg: "bg-gold-500/15" },
  adjustment: { label: "Adjustment", icon: Sliders, color: "text-ink-300", bg: "bg-white/10" },
  agent_credit: { label: "Admin credit", icon: Banknote, color: "text-gold-300", bg: "bg-gold-500/15" },
};
