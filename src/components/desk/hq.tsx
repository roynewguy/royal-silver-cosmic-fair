"use client";

import { useState } from "react";
import { Loader2, Radar, Ship } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChannelFeed } from "@/components/desk/channel";
import { PickTicket } from "@/components/desk/pick-ticket";
import { SportRail } from "@/components/desk/sport-rail";
import { useDesk } from "@/lib/desk/use-desk";
import { formatKick, relativeTo } from "@/lib/utils";
import type { CalibrationReport, GameCard } from "@/lib/sports/types";

export function DeskHq() {
  const desk = useDesk();
  const [webhook, setWebhook] = useState("");
  const [pin, setPin] = useState("");
  const op = desk.data.operator;

  const queued = desk.data.picks.filter((p) => p.status === "queued" || p.status === "posting" || p.status === "posted");
  const busy = desk.scanning || desk.running;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs tracking-[0.22em] text-accent uppercase">Command desk</p>
          <h1 className="mt-1 font-display text-4xl tracking-wide text-fg sm:text-5xl">Today's board</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Official card is today in PT, DraftKings only. Worker posts after Discord confirms, then grades.
            MLS/EPL stay dark until 3-way markets.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {op ? (
            <>
              <Button variant="secondary" onClick={() => desk.refresh()} disabled={busy} className="min-h-12">
                {desk.scanning ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
                Scan odds
              </Button>
              <Button onClick={() => desk.run()} disabled={busy} className="min-h-12">
                {desk.running ? <Loader2 className="size-4 animate-spin" /> : <Ship className="size-4" />}
                Run the desk
              </Button>
              <Button variant="ghost" onClick={() => desk.lock()} className="min-h-12">
                Lock
              </Button>
            </>
          ) : (
            <form
              className="flex min-w-0 gap-2"
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
                className="min-h-12 w-44"
                autoComplete="off"
                minLength={8}
              />
              <Button type="submit" className="min-h-12">
                Unlock
              </Button>
            </form>
          )}
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
              <p className="font-display text-xl text-fg">{op ? "No locks queued" : "No posted plays yet"}</p>
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
          {op && desk.data.calibration ? <CalibrationPanel report={desk.data.calibration} /> : null}
        </div>

        <div className="min-w-0 space-y-4">
          <ChannelFeed picks={desk.data.picks} log={desk.data.log} />
          <div className="rounded-xl bg-surface p-4 shadow-border">
            <p className="text-sm font-medium text-fg">Discord webhook</p>
            <p className="mt-1 text-xs text-subtle">
              {desk.data.webhookSource === "env"
                ? "Using DISCORD_WEBHOOK_URL on the server. Never commit it."
                : desk.data.hasWebhook
                  ? "Webhook is saved on the desk (not GitHub)."
                  : "Set DISCORD_WEBHOOK_URL in hosting secrets, or paste here after unlock."}
            </p>
            {op && desk.data.webhookSource !== "env" ? (
              <Input
                className="mt-3"
                type="password"
                autoComplete="off"
                placeholder="https://discord.com/api/webhooks/…"
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                onBlur={() => desk.saveHook(webhook)}
              />
            ) : null}
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

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function CalibrationPanel({ report }: { report: CalibrationReport }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-sm tracking-[0.18em] text-muted uppercase">Calibration</h2>
      <div className="rounded-xl bg-surface p-4 shadow-border">
        <p className="text-xs leading-relaxed text-subtle">{report.note}</p>
        <table className="mt-3 w-full text-left font-mono text-[11px] tabular-nums text-muted">
          <thead>
            <tr className="text-subtle">
              <th className="pb-2 font-medium">Bucket</th>
              <th>n</th>
              <th>W-L-P</th>
              <th>Actual</th>
              <th>Expect</th>
              <th>Δ</th>
              <th>u</th>
            </tr>
          </thead>
          <tbody>
            {report.buckets.map((b) => (
              <tr key={b.key} className="border-t border-border">
                <td className="py-1.5 text-fg">{b.key}%</td>
                <td>{b.decided}</td>
                <td>
                  {b.wins}-{b.losses}-{b.pushes}
                </td>
                <td>{pct(b.actualWinRate)}</td>
                <td>{pct(b.expectedWinRate)}</td>
                <td>{b.delta == null ? "—" : `${b.delta >= 0 ? "+" : ""}${(b.delta * 100).toFixed(1)}`}</td>
                <td>{b.units.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {report.models.length ? (
          <table className="mt-4 w-full text-left font-mono text-[11px] tabular-nums text-muted">
            <thead>
              <tr className="text-subtle">
                <th className="pb-2 font-medium">Model</th>
                <th>n</th>
                <th>Hit</th>
                <th>Expect</th>
                <th>CLV</th>
                <th>u</th>
              </tr>
            </thead>
            <tbody>
              {report.models.map((m) => (
                <tr key={m.key} className="border-t border-border">
                  <td className="py-1.5 text-fg">{m.key}</td>
                  <td>{m.decided}</td>
                  <td>{pct(m.actualWinRate)}</td>
                  <td>{pct(m.expectedWinRate)}</td>
                  <td>{m.avgClv == null ? "—" : m.avgClv.toFixed(3)}</td>
                  <td>{m.units.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
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
