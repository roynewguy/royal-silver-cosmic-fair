"use client";

import { StatusDot } from "@/components/desk/status-dot";
import { useDesk } from "@/lib/desk/use-desk";
import { relativeTo } from "@/lib/utils";
import type { ServiceLevel } from "@/lib/sports/types";

function Cell({ label, level, note }: { label: string; level: ServiceLevel; note: string }) {
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

export function HealthBoard() {
  const desk = useDesk();
  const health = desk.data.health;
  const live = desk.data.livePosting;
  const paper = desk.data.paperMode;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.22em] text-accent uppercase">BoatBoyz</p>
        <h1 className="mt-1 font-display text-4xl tracking-wide sm:text-5xl">Health</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Production board. LIVE posting cannot be turned on from this screen — only host env.
        </p>
      </div>

      <p className="rounded-xl bg-surface p-4 font-display text-lg">
        New automated posts: {live ? "ON" : "OFF — kill switch active"}
        {paper ? " · PAPER MODE" : ""}
        {health.shadowSoak ? " · SHADOW SOAK" : ""}
      </p>

      <section>
        <h2 className="mb-2 font-display text-sm tracking-[0.18em] text-muted uppercase">Clocks</h2>
        <div className="grid gap-2 text-sm text-muted sm:grid-cols-2 lg:grid-cols-4">
          <p>Last tick: {health.lastTickAt ? relativeTo(health.lastTickAt) : "never"}</p>
          <p>Next tick: {health.nextScanAt ? relativeTo(health.nextScanAt) : "—"}</p>
          <p>Last ESPN: {health.lastScanAt ? relativeTo(health.lastScanAt) : "—"}</p>
          <p>Last sportsbook: {health.lastSportsbookAt ? relativeTo(health.lastSportsbookAt) : "—"}</p>
          <p>Last official post: {health.lastOfficialPostAt ? relativeTo(health.lastOfficialPostAt) : "never"}</p>
          <p>Last grade: {health.lastGradeAt ? relativeTo(health.lastGradeAt) : "never"}</p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-display text-sm tracking-[0.18em] text-muted uppercase">Services</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Cell label="Automation" level={health.automation === "online" ? "ok" : health.automation === "delayed" ? "warn" : "bad"} note={health.automation} />
          <Cell label="Database" level={health.db} note={health.dbLabel} />
          <Cell label="ESPN" level={health.espn} note={health.lastScanAt ? "Scoreboard scan" : "No recent scan"} />
          <Cell label="Discord" level={health.discord} note={health.discordLabel} />
          <Cell label="Odds quota" level={health.odds} note={health.oddsLabel} />
          <Cell
            label="Injury feed"
            level={health.staleInjuryFeeds ? "bad" : "ok"}
            note={health.staleInjuryFeeds ? "Stale or missing" : "Fresh on scheduled games"}
          />
          <Cell
            label="Market feed"
            level={health.staleMarketFeeds ? "warn" : "ok"}
            note={health.staleMarketFeeds ? "Stale or missing DK" : "Fresh DraftKings quotes"}
          />
          <Cell
            label="Soak recorder"
            level={!health.shadowSoak ? "ok" : health.soakRecorderFailed ? "bad" : "ok"}
            note={
              !health.shadowSoak
                ? "Off"
                : health.soakRecorderFailed
                  ? "FAILED — not 0 hypothetical bets"
                  : health.soakWouldHavePosted == null
                    ? "Armed"
                    : `${health.soakWouldHavePosted} would-have-posted`
            }
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-display text-sm tracking-[0.18em] text-muted uppercase">Backlog</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <Cell label="Pending grades" level={health.pendingGrades > 3 ? "warn" : "ok"} note={String(health.pendingGrades)} />
          <Cell label="delivery_unknown" level={health.deliveryUnknown > 0 ? "bad" : "ok"} note={String(health.deliveryUnknown)} />
          <Cell label="Stale jobs" level={health.staleJobs > 0 ? "warn" : "ok"} note={String(health.staleJobs)} />
        </div>
      </section>

      {desk.data.operator ? (
        <section className="rounded-xl bg-surface px-5 py-4 shadow-border">
          <h2 className="font-display text-sm tracking-[0.18em] text-muted uppercase">Latest alert</h2>
          <p className="mt-2 text-sm text-fg">{health.latestAlert ?? "None recorded"}</p>
        </section>
      ) : (
        <p className="text-sm text-muted">Unlock operator to see private alert detail. Alerts never go to customer Discord.</p>
      )}
    </div>
  );
}
