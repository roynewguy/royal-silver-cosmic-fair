"use client";

import { useEffect, useState } from "react";
import { Loader2, Radar, Ship } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChannelFeed } from "@/components/desk/channel";
import { PickTicket } from "@/components/desk/pick-ticket";
import { SportRail } from "@/components/desk/sport-rail";
import { useDesk } from "@/lib/desk/use-desk";
import { formatKick, relativeTo } from "@/lib/utils";
import type { GameCard } from "@/lib/sports/types";

const WEBHOOK_KEY = "boat-boyz-discord-webhook";

export function DeskHq() {
  const desk = useDesk();
  const [webhook, setWebhook] = useState("");

  useEffect(() => {
    try {
      setWebhook(localStorage.getItem(WEBHOOK_KEY) ?? "");
    } catch {
      /* ignore */
    }
  }, []);

  function saveWebhook(value: string) {
    setWebhook(value);
    try {
      if (value) localStorage.setItem(WEBHOOK_KEY, value);
      else localStorage.removeItem(WEBHOOK_KEY);
    } catch {
      /* ignore */
    }
  }

  const queued = desk.data.picks.filter((p) => p.status === "queued" || p.status === "posted");
  const busy = desk.scanning || desk.running;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs tracking-[0.22em] text-accent uppercase">Command desk</p>
          <h1 className="mt-1 font-display text-4xl tracking-wide text-fg sm:text-5xl">Today's board</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Scan every live sport, rank the number, research the top of the card, and lock one play per
            sport. Thin edges get skipped. Odds freeze the moment a pick hits #picks.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" onClick={() => desk.refresh()} disabled={busy} className="min-h-12">
            {desk.scanning ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
            Scan odds
          </Button>
          <Button onClick={() => desk.run()} disabled={busy} className="min-h-12">
            {desk.running ? <Loader2 className="size-4 animate-spin" /> : <Ship className="size-4" />}
            Run the desk
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Meta label="Last scan" value={desk.data.lastScanAt ? relativeTo(desk.data.lastScanAt) : "—"} />
        <Meta label="Post window" value={`${desk.data.postLeadMinutes / 60}h pre-kick`} />
        <Meta label="Edge floor" value={`${desk.data.minEdgePct}% · conf ${desk.data.minConfidence}`} />
      </div>

      {desk.loading || busy ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : null}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-3">
          <h2 className="font-display text-sm tracking-[0.18em] text-muted uppercase">Sports</h2>
          <SportRail scans={desk.data.scans} picks={desk.data.picks} />
        </div>

        <div className="min-w-0 space-y-4">
          <h2 className="font-display text-sm tracking-[0.18em] text-muted uppercase">Best plays</h2>
          {queued.length === 0 ? (
            <div className="rounded-xl bg-surface px-5 py-8 shadow-border">
              <p className="font-display text-xl text-fg">No locks queued</p>
              <p className="mt-2 text-sm text-muted">
                Hit Run the desk. Sports without a real edge stay dark.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {queued.map((pick) => (
                <PickTicket
                  key={pick.id}
                  pick={pick}
                  posting={desk.posting}
                  onPost={() => desk.push({ pickId: pick.id, webhookUrl: webhook || undefined })}
                />
              ))}
            </div>
          )}

          <Upcoming games={desk.data.games} />
        </div>

        <div className="min-w-0 space-y-4">
          <ChannelFeed picks={desk.data.picks} log={desk.data.log} />
          <div className="rounded-xl bg-surface p-4 shadow-border">
            <p className="text-sm font-medium text-fg">Discord webhook</p>
            <p className="mt-1 text-xs text-subtle">
              Optional. Stored only on this device. Posts from the desk never save the URL.
            </p>
            <Input
              className="mt-3"
              type="password"
              autoComplete="off"
              placeholder="https://discord.com/api/webhooks/…"
              value={webhook}
              onChange={(e) => saveWebhook(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface px-4 py-3 shadow-border">
      <p className="text-[10px] tracking-[0.16em] text-subtle uppercase">{label}</p>
      <p className="mt-1 font-mono text-sm break-words tabular-nums text-fg">{value}</p>
    </div>
  );
}

function Upcoming({ games }: { games: GameCard[] }) {
  const upcoming = games
    .filter((g) => g.status === "scheduled")
    .slice()
    .sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt))
    .slice(0, 8);
  if (upcoming.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 font-display text-sm tracking-[0.18em] text-muted uppercase">Next kickoffs</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-border">
        {upcoming.map((g) => (
          <li key={g.id} className="flex items-center gap-3 px-4 py-3">
            <TeamMark src={g.away.logo} name={g.away.abbr} />
            <span className="text-xs text-subtle">@</span>
            <TeamMark src={g.home.logo} name={g.home.abbr} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-fg">
                {g.away.abbr} @ {g.home.abbr}
              </p>
              <p className="text-xs text-subtle">
                {g.sport} · {formatKick(g.startAt)}
              </p>
            </div>
            <span className="max-w-[9rem] truncate font-mono text-xs text-muted tabular-nums sm:max-w-none">
              {g.odds.details ?? "No line"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TeamMark({ src, name }: { src: string | null; name: string }) {
  if (!src) {
    return (
      <span className="flex size-7 items-center justify-center rounded-full bg-surface-2 font-mono text-[10px] text-muted">
        {name.slice(0, 2)}
      </span>
    );
  }
  return <img src={src} alt="" className="size-7 object-contain" />;
}
