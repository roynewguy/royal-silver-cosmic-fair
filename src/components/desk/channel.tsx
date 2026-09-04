"use client";

import { Hash } from "lucide-react";
import { formatClock, relativeTo } from "@/lib/utils";
import type { DeskLog, PickRow } from "@/lib/sports/types";
import { Badge } from "@/components/ui/badge";

export function ChannelFeed({ picks, log }: { picks: PickRow[]; log: DeskLog[] }) {
  const posted = picks.filter((p) => p.status === "posted" || p.status === "graded");
  return (
    <section className="flex min-h-[28rem] flex-col overflow-hidden rounded-xl bg-bg-elevated shadow-border">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Hash className="size-4 text-muted" />
        <div>
          <p className="text-sm font-medium text-fg">picks</p>
          <p className="text-xs text-subtle">Boat Boyz radio · auto-posts 2.5h before kick</p>
        </div>
      </header>
      <div className="channel-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {posted.length === 0 && log.length === 0 ? (
          <p className="text-sm text-muted">No posts yet. Run the desk to queue the board.</p>
        ) : null}
        {posted.map((pick) => (
          <article key={pick.id} className="flex gap-3">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-accent font-display text-xs text-accent-fg">
              BB
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-medium text-fg">Boat Boyz Picks</span>
                <span className="font-mono text-[11px] text-subtle tabular-nums">
                  {pick.postedAt ? formatClock(pick.postedAt) : relativeTo(pick.postAt)}
                </span>
                {pick.result ? (
                  <Badge tone={pick.result === "WIN" ? "win" : pick.result === "LOSS" ? "loss" : "push"}>
                    {pick.result}
                  </Badge>
                ) : (
                  <Badge tone="accent">LIVE</Badge>
                )}
              </div>
              <pre className="mt-1 font-sans text-sm leading-relaxed whitespace-pre-wrap text-muted">
                {pick.discordMessage ?? `${pick.sport} · ${pick.selection}\n${pick.reason}`}
              </pre>
            </div>
          </article>
        ))}
        {log.slice(0, 8).map((entry) => (
          <p key={entry.id} className="text-xs text-subtle">
            <span className="font-mono tabular-nums">{relativeTo(entry.createdAt)}</span>
            {" · "}
            {entry.sport ? `${entry.sport} · ` : ""}
            {entry.message}
          </p>
        ))}
      </div>
    </section>
  );
}
