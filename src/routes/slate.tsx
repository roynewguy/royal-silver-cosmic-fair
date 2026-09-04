"use client";

import { createFileRoute } from "@tanstack/react-router";
import { DeskShell } from "@/components/desk/shell";
import { Badge } from "@/components/ui/badge";
import { useDesk } from "@/lib/desk/use-desk";
import { formatAmerican, formatKick, formatLine } from "@/lib/utils";

export const Route = createFileRoute("/slate")({ component: SlatePage });

function SlatePage() {
  return (
    <DeskShell>
      <SlateBody />
    </DeskShell>
  );
}

function SlateBody() {
  const desk = useDesk();
  const sports = [...new Set(desk.data.games.map((g) => g.sport))];

  return (
    <>
      <p className="text-xs tracking-[0.22em] text-accent uppercase">Odds board</p>
      <h1 className="mt-1 font-display text-4xl tracking-wide">The slate</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Live DraftKings numbers via ESPN. Ranked edges show on the right. No play is posted from here —
        the desk still has to lock it.
      </p>
      <div className="mt-6 space-y-8">
        {sports.length === 0 ? (
          <p className="text-sm text-muted">Scan the desk to load today’s games.</p>
        ) : null}
        {sports.map((sport) => {
          const games = desk.data.games
            .filter((g) => g.sport === sport)
            .sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
          return (
            <section key={sport}>
              <h2 className="mb-3 font-display text-xl tracking-wide">{sport}</h2>
              <div className="overflow-x-auto rounded-xl bg-surface shadow-border">
                <table className="w-full min-w-[44rem] text-left text-sm">
                  <thead className="text-[11px] tracking-[0.14em] text-subtle uppercase">
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 font-medium">Matchup</th>
                      <th className="px-3 py-3 font-medium">Kick</th>
                      <th className="px-3 py-3 font-medium">Spread</th>
                      <th className="px-3 py-3 font-medium">Total</th>
                      <th className="px-3 py-3 font-medium">ML</th>
                      <th className="px-3 py-3 font-medium">Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((g) => (
                      <tr key={g.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {g.away.logo ? <img src={g.away.logo} alt="" className="size-6 object-contain" /> : null}
                            <span className="text-fg">
                              {g.away.abbr} @ {g.home.abbr}
                            </span>
                            {g.home.logo ? <img src={g.home.logo} alt="" className="size-6 object-contain" /> : null}
                            {g.status === "in_progress" ? <Badge tone="accent">LIVE</Badge> : null}
                            {g.status === "final" ? <Badge>FINAL</Badge> : null}
                          </div>
                          {g.status !== "scheduled" && g.home.score != null ? (
                            <p className="mt-1 font-mono text-xs tabular-nums text-muted">
                              {g.away.abbr} {g.away.score} · {g.home.abbr} {g.home.score}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-muted tabular-nums">
                          {formatKick(g.startAt)}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs tabular-nums">
                          {g.odds.homeSpread != null
                            ? `${g.home.abbr} ${formatLine(g.odds.homeSpread)} ${formatAmerican(g.odds.homeSpreadOdds)}`
                            : "—"}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs tabular-nums">
                          {g.odds.total != null ? `${g.odds.total} ${formatAmerican(g.odds.overOdds)}` : "—"}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs tabular-nums">
                          {g.odds.homeMl != null ? `${g.home.abbr} ${formatAmerican(g.odds.homeMl)}` : "—"}
                        </td>
                        <td className="px-3 py-3">
                          {g.rank ? (
                            <div>
                              <p className="text-accent">{g.rank.selection}</p>
                              <p className="text-xs text-subtle">
                                {g.rank.edgePct.toFixed(1)}% · {g.rank.confidence}
                              </p>
                            </div>
                          ) : (
                            <span className="text-subtle">Pass</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
