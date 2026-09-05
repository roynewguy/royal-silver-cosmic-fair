"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDesk } from "@/lib/desk/use-desk";
import { ticketCopy, ticketLabel } from "@/lib/desk/card-view";
import { formatAmerican, formatKick, formatUnits } from "@/lib/utils";
import type { PickResult } from "@/lib/sports/types";

export function RecordBoard() {
  const desk = useDesk();
  const [sport, setSport] = useState("ALL");
  const [result, setResult] = useState<"ALL" | PickResult>("ALL");
  const official = desk.data.picks.filter((p) => p.officialKey && (p.status === "posted" || p.status === "graded"));
  const sports = ["ALL", ...new Set(official.map((p) => p.sport))];
  const graded = official.filter((p) => p.result);
  const decided = graded.filter((p) => p.result === "WIN" || p.result === "LOSS");
  const risked = decided.reduce((s, p) => s + p.units, 0);
  const roi = risked ? desk.data.record.units / risked : 0;
  const clvs = graded.map((p) => p.clv).filter((n): n is number => n != null);
  const avgClv = clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null;

  const rows = useMemo(() => {
    return official
      .filter((p) => (sport === "ALL" ? true : p.sport === sport))
      .filter((p) => (result === "ALL" ? true : p.result === result))
      .slice()
      .sort((a, b) => +new Date(b.postedAt ?? b.createdAt) - +new Date(a.postedAt ?? a.createdAt));
  }, [official, sport, result]);

  let running = 0;
  const chart = graded
    .slice()
    .sort((a, b) => +new Date(a.gradedAt ?? a.createdAt) - +new Date(b.gradedAt ?? b.createdAt))
    .map((p) => {
      running += p.profitUnits ?? 0;
      return { name: p.selection, units: Number(running.toFixed(2)) };
    });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.22em] text-accent uppercase">Book</p>
        <h1 className="mt-1 font-display text-4xl tracking-wide">Record</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">Official graded tickets only. Losses stay. Nothing here is rewritten.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Overall" value={`${desk.data.record.wins}-${desk.data.record.losses}-${desk.data.record.pushes}`} />
        <Stat label="Units" value={formatUnits(desk.data.record.units)} hot={desk.data.record.units} />
        <Stat label="ROI" value={risked ? `${(roi * 100).toFixed(1)}%` : "—"} hot={roi} />
        <Stat label="Avg CLV" value={avgClv == null ? "—" : `${avgClv >= 0 ? "+" : ""}${(avgClv * 100).toFixed(1)}%`} />
      </div>

      <div className="h-48 rounded-xl bg-surface p-4 shadow-border">
        {chart.length < 2 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">Grade official plays to fill the curve.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="unitsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" hide />
              <YAxis width={40} tick={{ fill: "var(--color-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  color: "var(--color-fg)",
                }}
              />
              <Area type="monotone" dataKey="units" stroke="var(--color-accent)" fill="url(#unitsFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {sports.map((s) => (
          <Button key={s} size="sm" variant={sport === s ? "primary" : "ghost"} onClick={() => setSport(s)}>
            {s}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {(["ALL", "WIN", "LOSS", "PUSH", "VOID"] as const).map((s) => (
          <Button key={s} size="sm" variant={result === s ? "secondary" : "ghost"} onClick={() => setResult(s)}>
            {s === "ALL" ? "All results" : s}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {rows.map((pick) => {
          const label = ticketLabel(pick);
          return (
            <article key={pick.id} className="rounded-xl bg-surface p-4 shadow-border">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs tracking-[0.16em] text-subtle uppercase">{pick.sport}</p>
                  <p className="mt-1 font-display text-xl tracking-wide">{pick.selection}</p>
                  <p className="text-xs text-muted">{formatKick(pick.startAt, "America/Los_Angeles")} PT</p>
                </div>
                <Badge tone={label === "win" ? "win" : label === "loss" ? "loss" : label === "push" ? "push" : "muted"}>
                  {ticketCopy(label)}
                </Badge>
              </div>
              <p className="mt-3 font-mono text-xs tabular-nums text-muted">
                DK {formatAmerican(pick.postedOdds ?? pick.lockedOdds)} · {Number(pick.units).toFixed(1)}U ·{" "}
                {pick.profitUnits != null ? formatUnits(pick.profitUnits) : "open"} · {pick.modelVersion ?? "—"}
                {pick.clv != null ? ` · CLV ${(pick.clv * 100).toFixed(1)}%` : ""}
              </p>
            </article>
          );
        })}
        {rows.length === 0 ? <p className="text-sm text-muted">No official tickets in this filter.</p> : null}
      </div>
    </div>
  );
}

function Stat({ label, value, hot }: { label: string; value: string; hot?: number }) {
  const color = hot == null ? "text-fg" : hot > 0 ? "text-win" : hot < 0 ? "text-loss" : "text-fg";
  return (
    <div className="rounded-lg bg-surface px-4 py-3 shadow-border">
      <p className="text-[10px] tracking-[0.16em] text-subtle uppercase">{label}</p>
      <p className={`mt-1 font-mono text-lg tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
