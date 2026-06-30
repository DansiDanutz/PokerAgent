"use client";

import { useMemo, useState, useTransition } from "react";
import { clsx } from "clsx";
import { Trash2, Sparkles, Plus, Minus } from "lucide-react";
import {
  calculateEquity,
  countOuts,
  drawProbability,
  potOdds,
  fullDeck,
  HOLE_COUNT,
  RANKS,
  SUITS,
  makeCard,
  type Card,
  type EquityResult,
  type GameType,
} from "@/lib/poker";
import { Card as Panel, Button, SectionTitle, Badge, ProgressBar } from "@/components/ui";
import { PlayingCard, EmptySlot } from "./PlayingCard";
import { formatPercent } from "@/lib/format";

type SlotId = string; // "p:<i>:<j>" or "b:<j>"

const MAX_PLAYERS = 6;

export function Calculator() {
  const [game, setGame] = useState<GameType>("holdem");
  const [numPlayers, setNumPlayers] = useState(2);
  const [players, setPlayers] = useState<Card[][]>([[], []]);
  const [board, setBoard] = useState<Card[]>([]);
  const [active, setActive] = useState<SlotId | null>("p:0:0");
  const [result, setResult] = useState<EquityResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [pot, setPot] = useState("");
  const [call, setCall] = useState("");

  const holeCount = HOLE_COUNT[game];

  const usedIds = useMemo(() => {
    const s = new Set<number>();
    players.forEach((p) => p.forEach((c) => s.add(c.id)));
    board.forEach((c) => s.add(c.id));
    return s;
  }, [players, board]);

  // --- slot helpers -------------------------------------------------------
  function cardAt(id: SlotId): Card | undefined {
    const [k, a, b] = id.split(":");
    if (k === "p") return players[Number(a)]?.[Number(b)];
    return board[Number(a)];
  }

  function setCardAt(id: SlotId, card: Card | null) {
    const [k, a, b] = id.split(":");
    if (k === "p") {
      const i = Number(a);
      const j = Number(b);
      setPlayers((prev) =>
        prev.map((hand, idx) => {
          if (idx !== i) return hand;
          const next = [...hand];
          if (card) next[j] = card;
          else next.splice(j, 1);
          return next;
        }),
      );
    } else {
      const j = Number(a);
      setBoard((prev) => {
        const next = [...prev];
        if (card) next[j] = card;
        else next.splice(j, 1);
        return next;
      });
    }
    setResult(null);
  }

  function nextEmptySlot(): SlotId | null {
    for (let i = 0; i < numPlayers; i++) {
      for (let j = 0; j < holeCount; j++) {
        if (!players[i]?.[j]) return `p:${i}:${j}`;
      }
    }
    for (let j = 0; j < 5; j++) {
      if (!board[j]) return `b:${j}`;
    }
    return null;
  }

  function pickCard(card: Card) {
    if (usedIds.has(card.id)) return;
    const target = active ?? nextEmptySlot();
    if (!target) return;
    setCardAt(target, card);
    // advance selection
    setActive(() => {
      // recompute against the soon-to-be-updated state heuristically
      for (let i = 0; i < numPlayers; i++) {
        for (let j = 0; j < holeCount; j++) {
          const id = `p:${i}:${j}`;
          if (id === target) continue;
          if (!cardAt(id) && id !== target) return id;
        }
      }
      for (let j = 0; j < 5; j++) {
        const id = `b:${j}`;
        if (id === target) continue;
        if (!cardAt(id)) return id;
      }
      return null;
    });
  }

  function changePlayers(delta: number) {
    const n = Math.max(2, Math.min(MAX_PLAYERS, numPlayers + delta));
    setNumPlayers(n);
    setPlayers((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push([]);
      return next;
    });
    setResult(null);
  }

  function changeGame(g: GameType) {
    setGame(g);
    setPlayers(Array.from({ length: numPlayers }, () => []));
    setBoard([]);
    setResult(null);
    setActive("p:0:0");
  }

  function clearAll() {
    setPlayers(Array.from({ length: numPlayers }, () => []));
    setBoard([]);
    setResult(null);
    setActive("p:0:0");
  }

  function dealRandom() {
    const deck = fullDeck().sort(() => Math.random() - 0.5);
    let c = 0;
    const newPlayers = Array.from({ length: numPlayers }, () => deck.slice(c, (c += holeCount)));
    setPlayers(newPlayers);
    setBoard([]);
    setActive("b:0");
    setResult(null);
  }

  function compute() {
    const playerInputs = players.map((hand, i) => ({
      hole: hand.length === holeCount ? hand : null,
      label: i === 0 ? "Hero" : `Player ${i + 1}`,
    }));
    const iterationsBase = game === "omaha" ? 8000 : 20000;
    const iterations = Math.round(iterationsBase / Math.max(1, numPlayers - 1));
    startTransition(() => {
      try {
        const res = calculateEquity({
          game,
          players: playerInputs,
          board,
          iterations,
        });
        setResult(res);
      } catch {
        setResult(null);
      }
    });
  }

  // --- outs / pot odds (hero) --------------------------------------------
  const heroOuts = useMemo(() => {
    const hero = players[0];
    if (!hero || hero.length !== holeCount) return null;
    if (board.length !== 3 && board.length !== 4) return null;
    try {
      const { outs, hitPct } = countOuts({ game, hole: hero, board });
      const streets = board.length === 3 ? 2 : 1;
      return { outs, hitPct, byRiver: drawProbability(outs, streets as 1 | 2, 52 - usedIds.size) };
    } catch {
      return null;
    }
  }, [players, board, game, holeCount, usedIds.size]);

  const heroEquity = result?.players[0]?.equity;
  const odds =
    pot && call
      ? potOdds({ potBeforeCall: Number(pot), callAmount: Number(call), equity: heroEquity })
      : null;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl bg-felt-900 p-1">
            {(["holdem", "omaha"] as GameType[]).map((g) => (
              <button
                key={g}
                onClick={() => changeGame(g)}
                className={clsx(
                  "rounded-lg px-4 py-2 text-sm font-medium capitalize transition",
                  game === g ? "bg-emerald-glow/15 text-emerald-soft" : "text-ink-400 hover:text-ink-200",
                )}
              >
                {g === "holdem" ? "Texas Hold'em" : "Omaha"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-400">Players</span>
            <div className="inline-flex items-center gap-1 rounded-xl bg-felt-900 p-1">
              <IconBtn onClick={() => changePlayers(-1)} disabled={numPlayers <= 2}><Minus size={14} /></IconBtn>
              <span className="w-6 text-center text-sm font-semibold text-ink-100">{numPlayers}</span>
              <IconBtn onClick={() => changePlayers(1)} disabled={numPlayers >= MAX_PLAYERS}><Plus size={14} /></IconBtn>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={dealRandom}><Sparkles size={15} /> Deal</Button>
            <Button variant="ghost" onClick={clearAll}><Trash2 size={15} /> Clear</Button>
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Hands + board */}
        <Panel>
          <SectionTitle title="Hands & board" subtitle="Tap a slot, then pick a card below" />
          <div className="space-y-3">
            {Array.from({ length: numPlayers }).map((_, i) => {
              const equity = result?.players[i]?.equity;
              return (
                <div key={i} className="flex flex-wrap items-center gap-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5">
                  <div className="w-16 shrink-0">
                    <p className="text-sm font-medium text-ink-100">{i === 0 ? "Hero" : `P${i + 1}`}</p>
                    {equity !== undefined && (
                      <p className="text-xs font-semibold text-emerald-soft">{formatPercent(equity)}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: holeCount }).map((__, j) => {
                      const id = `p:${i}:${j}`;
                      const card = players[i]?.[j];
                      return card ? (
                        <PlayingCard key={id} card={card} size="md" selected={active === id} onClick={() => { setCardAt(id, null); setActive(id); }} />
                      ) : (
                        <EmptySlot key={id} active={active === id} onClick={() => setActive(id)} />
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Board */}
            <div className="rounded-xl bg-felt-700/40 p-3 ring-1 ring-inset ring-emerald-glow/10">
              <p className="mb-2 text-xs uppercase tracking-wide text-ink-400">Community board</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 5 }).map((_, j) => {
                  const id = `b:${j}`;
                  const card = board[j];
                  return card ? (
                    <PlayingCard key={id} card={card} size="md" selected={active === id} onClick={() => { setCardAt(id, null); setActive(id); }} />
                  ) : (
                    <EmptySlot key={id} active={active === id} onClick={() => setActive(id)} />
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-ink-500">Flop = 3 · Turn = 4 · River = 5 · leave empty to run from preflop</p>
            </div>
          </div>

          <Button className="mt-4 w-full" onClick={compute} disabled={pending}>
            {pending ? "Calculating equity…" : "Calculate odds"}
          </Button>
        </Panel>

        {/* Results */}
        <div className="space-y-6">
          <Panel>
            <SectionTitle
              title="Equity"
              subtitle={result ? (result.exact ? `Exact · ${result.iterations.toLocaleString()} runouts` : `Monte Carlo · ${result.iterations.toLocaleString()} trials`) : "Run a calculation to see win %"}
            />
            {result ? (
              <div className="space-y-3">
                {result.players.map((p, i) => (
                  <div key={i}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-ink-200">{p.label}</span>
                      <span className="font-semibold text-ink-100">
                        {formatPercent(p.equity)}
                        <span className="ml-2 text-xs text-ink-500">
                          win {formatPercent(p.win)} · tie {formatPercent(p.tie)}
                        </span>
                      </span>
                    </div>
                    <ProgressBar value={p.equity} tone={i === 0 ? "emerald" : "gold"} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-ink-400">
                Set at least one hand and press <span className="text-emerald-soft">Calculate odds</span>.
                Empty hands are treated as random opponents.
              </p>
            )}
          </Panel>

          {heroOuts && (
            <Panel glow="emerald">
              <SectionTitle title="Hero draw" subtitle="Cards that improve your hand" />
              <div className="grid grid-cols-3 gap-3 text-center">
                <Metric label="Outs" value={String(heroOuts.outs)} />
                <Metric label="Next card" value={formatPercent(heroOuts.hitPct)} />
                <Metric label="By river" value={formatPercent(heroOuts.byRiver)} gold />
              </div>
            </Panel>
          )}

          <Panel>
            <SectionTitle title="Pot odds" subtitle="Should you call?" />
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Pot size" value={pot} onChange={setPot} placeholder="100" />
              <NumberField label="Amount to call" value={call} onChange={setCall} placeholder="25" />
            </div>
            {odds && (
              <div className="mt-4 flex items-center justify-between rounded-xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5">
                <div>
                  <p className="text-xs text-ink-400">Break-even equity</p>
                  <p className="text-lg font-semibold gold-text">{formatPercent(odds.breakEvenEquity)}</p>
                  <p className="text-[11px] text-ink-500">Pot odds {odds.ratio}</p>
                </div>
                {odds.call !== null && (
                  <Badge tone={odds.call ? "emerald" : "danger"}>
                    {odds.call ? "+EV call" : "Fold"}
                  </Badge>
                )}
              </div>
            )}
            {heroEquity === undefined && (
              <p className="mt-2 text-[11px] text-ink-500">Calculate equity first to get a call/fold verdict.</p>
            )}
          </Panel>
        </div>
      </div>

      {/* Card picker */}
      <Panel>
        <SectionTitle title="Card picker" subtitle="Greyed-out cards are already in play" />
        <div className="space-y-2">
          {SUITS.map((suit) => (
            <div key={suit} className="flex flex-wrap gap-1.5">
              {RANKS.map((rank) => {
                const card = makeCard(rank, suit);
                const used = usedIds.has(card.id);
                return (
                  <PlayingCard
                    key={card.id}
                    card={card}
                    size="sm"
                    dimmed={used}
                    onClick={used ? undefined : () => pickCard(card)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function IconBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="grid h-7 w-7 place-items-center rounded-lg text-ink-300 hover:bg-white/10 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Metric({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5">
      <p className="text-xs text-ink-400">{label}</p>
      <p className={clsx("mt-1 text-xl font-semibold", gold ? "gold-text" : "text-emerald-soft")}>{value}</p>
    </div>
  );
}

function NumberField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-400">{label}</span>
      <input
        type="number"
        min="0"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl bg-felt-900 px-3.5 py-2.5 text-sm text-ink-100 outline-none ring-1 ring-inset ring-white/10 placeholder:text-ink-500 focus:ring-emerald-glow/50"
      />
    </label>
  );
}
