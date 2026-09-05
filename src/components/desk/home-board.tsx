"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TicketCard } from "@/components/desk/ticket-card";
import { DiscordComposer } from "@/components/desk/discord-composer";
import { StatusDot } from "@/components/desk/status-dot";
import { useDesk } from "@/lib/desk/use-desk";
import { isLockedTicket, todayOfficialCard } from "@/lib/desk/card-view";
import { nextActionLine } from "@/lib/desk/next-action";
import { relativeTo } from "@/lib/utils";
import type { AutomationStatus, ServiceLevel } from "@/lib/sports/types";

const AUTO_COPY: Record<AutomationStatus, { title: string; hint: string }> = {
  online: { title: "ONLINE · 24/7", hint: "GitHub tick is contacting the live app." },
  delayed: { title: "DELAYED", hint: "Last successful tick is getting stale." },
  offline: { title: "AUTOMATION OFFLINE", hint: "Last successful tick is older than 25 minutes." },
  unarmed: { title: "24/7 AUTOMATION NOT ARMED", hint: "GitHub tick has not contacted BoatBoyz recently." },
};

function Service({ label, level, note }: { label: string; level: ServiceLevel; note: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg bg-surface px-3 py-2.5 shadow-border">
      <StatusDot level={level} />
      <div className="min-w-0">
        <p className="text-sm text-fg">{label}</p>
        <p className="truncate text-xs text-subtle">{note}</p>
      </div>
    </div>
  );
}

export function HomeBoard() {
  const desk = useDesk();
  const [pin, setPin] = useState("");
  const health = desk.data.health;
  const auto = AUTO_COPY[health.automation];
  const card = todayOfficialCard(desk.data.picks);
  const locked = card.filter(isLockedTicket);
  const provisional = card.filter((p) => !isLockedTicket(p));
  const next = nextActionLine({
    automation: health.automation,
    nextScanAt: health.nextScanAt,
    target: desk.data.maxDailyPicks || 3,
    picks: desk.data.picks,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs tracking-[0.22em] text-accent uppercase">BoatBoyz</p>
          <h1 className="mt-1 font-display text-4xl tracking-wide sm:text-5xl">Home</h1>
          <div className="mt-3 flex items-center gap-2">
            <StatusDot level={health.automation} />
            <p className="font-display text-lg tracking-wide text-fg">{auto.title}</p>
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted">{auto.hint}</p>
        </div>
        {desk.data.operator ? (
          <Button onClick={() => desk.run()} disabled={desk.running} className="min-h-12 w-full sm:w-auto">
            {desk.running ? <Loader2 className="size-4 animate-spin" /> : null}
            Run now
          </Button>
        ) : (
          <form
            className="flex w-full max-w-sm gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              desk.unlock(pin);
            }}
          >
            <Input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Operator secret"
              className="min-h-12"
              autoComplete="off"
              minLength={8}
            />
            <Button type="submit" className="min-h-12 shrink-0">
              Unlock
            </Button>
          </form>
        )}
      </div>

      <div className="grid gap-2 text-sm text-muted sm:grid-cols-3">
        <p>Last tick: {health.lastTickAt ? relativeTo(health.lastTickAt) : "never"}</p>
        <p>Last scan: {health.lastScanAt ? relativeTo(health.lastScanAt) : "—"}</p>
        <p>Next scan: {health.nextScanAt ? relativeTo(health.nextScanAt) : "—"}</p>
      </div>

      <section>
        <h2 className="mb-2 font-display text-sm tracking-[0.18em] text-muted uppercase">System</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Service label="Automation" level={health.automation === "online" ? "ok" : health.automation === "delayed" ? "warn" : "bad"} note={auto.title} />
          <Service label="Database" level={health.db} note={health.dbLabel} />
          <Service label="ESPN" level={health.espn} note={health.lastScanAt ? "Scoreboard scan" : "No recent scan"} />
          <Service label="Discord" level={health.discord} note={health.discordLabel} />
          <Service label="DraftKings" level={health.odds} note={health.oddsLabel} />
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-display text-sm tracking-[0.18em] text-muted uppercase">Today’s card</h2>
          <p className="font-mono text-xs tabular-nums text-subtle">
            Target {desk.data.maxDailyPicks || 3} · Locked {locked.length} · Provisional {provisional.length}
          </p>
        </div>
        {desk.loading && card.length === 0 ? (
          <div className="h-32 animate-pulse rounded-xl bg-surface" />
        ) : card.length === 0 ? (
          <div className="rounded-xl bg-surface px-5 py-8 shadow-border">
            <p className="font-display text-xl">No locks yet</p>
            <p className="mt-2 text-sm text-muted">BoatBoyz will post only if a play clears the board. Weak slates PASS.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {locked.length ? (
              <div className="space-y-3">
                <p className="text-xs tracking-[0.16em] text-win uppercase">Official / locked</p>
                {locked.map((pick) => (
                  <TicketCard key={pick.id} pick={pick} game={desk.data.games.find((g) => g.id === pick.gameId)} operator={desk.data.operator} />
                ))}
              </div>
            ) : null}
            {provisional.length && desk.data.operator ? (
              <div className="space-y-3">
                <p className="text-xs tracking-[0.16em] text-push uppercase">Provisional — not official</p>
                {provisional.map((pick) => (
                  <TicketCard key={pick.id} pick={pick} game={desk.data.games.find((g) => g.id === pick.gameId)} operator={desk.data.operator} />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </section>

      {desk.data.operator ? (
        <section className="rounded-xl bg-surface px-5 py-4 shadow-border">
          <h2 className="font-display text-sm tracking-[0.18em] text-muted uppercase">Post to Discord</h2>
          <p className="mt-1 text-xs text-subtle">Send any message as the BoatBoyz bot. Does not count as an official pick.</p>
          <div className="mt-3">
            <DiscordComposer compact />
          </div>
        </section>
      ) : null}

      <section className="rounded-xl bg-surface px-5 py-4 shadow-border">
        <h2 className="font-display text-sm tracking-[0.18em] text-muted uppercase">What BoatBoyz is doing next</h2>
        <p className="mt-2 text-lg text-fg">{next}</p>
      </section>
    </div>
  );
}
