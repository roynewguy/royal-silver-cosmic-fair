"use client";

import { createFileRoute } from "@tanstack/react-router";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DeskShell } from "@/components/desk/shell";
import { PickTicket } from "@/components/desk/pick-ticket";
import { useDesk } from "@/lib/desk/use-desk";
import { formatUnits } from "@/lib/utils";

export const Route = createFileRoute("/ledger")({ component: LedgerPage });

function LedgerPage() {
  return (
    <DeskShell>
      <LedgerBody />
    </DeskShell>
  );
}

function LedgerBody() {
  const desk = useDesk();
  const graded = desk.data.picks
    .filter((p) => p.result)
    .slice()
    .sort((a, b) => +new Date(a.gradedAt ?? a.createdAt) - +new Date(b.gradedAt ?? b.createdAt));
  let running = 0;
  const chart = graded.map((p) => {
    running += p.profitUnits ?? 0;
    return {
      name: p.matchup,
      units: Number(running.toFixed(2)),
    };
  });
  const bySport = new Map<string, { w: number; l: number; p: number; u: number }>();
  for (const pick of graded) {
    const row = bySport.get(pick.sport) ?? { w: 0, l: 0, p: 0, u: 0 };
    if (pick.result === "WIN") row.w += 1;
    else if (pick.result === "LOSS") row.l += 1;
    else row.p += 1;
    row.u += pick.profitUnits ?? 0;
    bySport.set(pick.sport, row);
  }

  return (
    <>
      <p className="text-xs tracking-[0.22em] text-accent uppercase">Book</p>
      <h1 className="mt-1 font-display text-4xl tracking-wide">Ledger</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Graded WIN / LOSS / PUSH against the number locked at post. The running record updates itself.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Wins" value={String(desk.data.record.wins)} />
        <Stat label="Losses" value={String(desk.data.record.losses)} />
        <Stat label="Pushes" value={String(desk.data.record.pushes)} />
        <Stat label="Units" value={formatUnits(desk.data.record.units)} hot={desk.data.record.units} />
      </div>

      <div className="mt-6 h-56 rounded-xl bg-surface p-4 shadow-border">
        {chart.length < 2 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Grade a few plays and the curve fills in.
          </div>
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
              <YAxis
                width={40}
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  color: "var(--color-fg)",
                }}
              />
              <Area
                type="monotone"
                dataKey="units"
                stroke="var(--color-accent)"
                fill="url(#unitsFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {[...bySport.entries()].map(([sport, row]) => (
          <div key={sport} className="rounded-lg bg-surface px-4 py-3 shadow-border">
            <p className="font-display tracking-wide">{sport}</p>
            <p className="mt-1 font-mono text-sm tabular-nums text-muted">
              {row.w}-{row.l}-{row.p} · {formatUnits(row.u)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 space-y-4">
        {desk.data.picks.length === 0 ? (
          <p className="text-sm text-muted">No tickets yet.</p>
        ) : (
          desk.data.picks.map((pick) => (
            <PickTicket key={pick.id} pick={pick} />
          ))
        )}
      </div>
    </>
  );
}

function Stat({ label, value, hot }: { label: string; value: string; hot?: number }) {
  const color =
    hot == null ? "text-fg" : hot > 0 ? "text-win" : hot < 0 ? "text-loss" : "text-fg";
  return (
    <div className="rounded-lg bg-surface px-4 py-3 shadow-border">
      <p className="text-[10px] tracking-[0.16em] text-subtle uppercase">{label}</p>
      <p className={`mt-1 font-mono text-lg tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
