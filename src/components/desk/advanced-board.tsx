"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDesk } from "@/lib/desk/use-desk";
import { lineFor, priceFor, selectionLabel } from "@/lib/sports/odds";
import { buildTestPreviewMessage } from "@/lib/sports/discord";
import { DiscordComposer } from "@/components/desk/discord-composer";
import { formatKick } from "@/lib/utils";
import type { CalibrationReport, GameCard, Market, Side } from "@/lib/sports/types";

export function AdvancedBoard() {
  const desk = useDesk();
  const [logKind, setLogKind] = useState("ALL");
  const [edge, setEdge] = useState(String(desk.data.minEdgePct));
  const [conf, setConf] = useState(String(desk.data.minConfidence));
  const [lead, setLead] = useState(String(desk.data.postLeadMinutes));
  const [previewId, setPreviewId] = useState<string>("");
  const health = desk.data.health;

  if (!desk.data.operator) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-4xl tracking-wide">Advanced</h1>
        <p className="text-sm text-muted">Unlock from Home to use operator tools.</p>
      </div>
    );
  }

  const logs = desk.data.log.filter((l) => {
    if (logKind === "ALL") return true;
    if (logKind === "ERROR") return /fail|error|unauthorized/i.test(l.message) || l.kind === "error";
    if (logKind === "WARNING") return /pass|skip|stale|delay/i.test(l.message);
    return l.kind === logKind.toLowerCase() || l.kind === logKind;
  });

  const upcoming = desk.data.games.filter((g) => g.status === "scheduled").slice(0, 30);
  const previewGame = desk.data.games.find((g) => g.id === previewId) ?? upcoming[0];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs tracking-[0.22em] text-accent uppercase">Operator</p>
        <h1 className="mt-1 font-display text-4xl tracking-wide">Advanced</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">Technical controls. Normal days live on Home.</p>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-sm tracking-[0.18em] text-muted uppercase">Automation settings</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="rounded-xl bg-surface p-4 shadow-border">
            <span className="text-xs tracking-[0.14em] text-subtle uppercase">Daily pick target</span>
            <select
              className="mt-2 w-full bg-transparent font-mono text-lg text-fg"
              value={desk.data.maxDailyPicks}
              onChange={(e) => desk.setDailyPicks(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <Field label="Minimum edge %" value={edge} onChange={setEdge} />
          <Field label="Minimum confidence" value={conf} onChange={setConf} />
          <Field label="Post lead (minutes)" value={lead} onChange={setLead} />
        </div>
        <Button variant="secondary" onClick={() => desk.saveSettings({ minEdgePct: Number(edge), minConfidence: Number(conf), postLeadMinutes: Number(lead) })}>
          Save settings
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-sm tracking-[0.18em] text-muted uppercase">Manual tools</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => desk.refresh()} disabled={desk.scanning}>
            {desk.scanning ? <Loader2 className="size-4 animate-spin" /> : null}
            Scan now
          </Button>
          <Button onClick={() => desk.run()} disabled={desk.running}>
            {desk.running ? <Loader2 className="size-4 animate-spin" /> : null}
            Force full cycle
          </Button>
          <Button variant="ghost" onClick={() => desk.lock()}>
            Lock desk
          </Button>
        </div>
        <ManualPick games={upcoming} />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-sm tracking-[0.18em] text-muted uppercase">Discord</h2>
        <p className="text-sm text-fg">{health.discordLabel}</p>
        <p className="text-xs text-subtle">Source: {desk.data.webhookSource === "env" ? "Environment" : desk.data.webhookSource === "desk" ? "Stored" : "Missing"}</p>
        <DiscordComposer />
        {desk.data.webhookSource !== "env" ? (
          <Input
            type="password"
            autoComplete="off"
            placeholder="Paste webhook — it will not display after save"
            onBlur={(e) => {
              if (e.target.value.trim()) desk.saveHook(e.target.value.trim());
            }}
          />
        ) : (
          <p className="text-xs text-subtle">Webhook is set on the host. Not shown here.</p>
        )}
        {previewGame ? (
          <div className="space-y-2">
            <select className="w-full rounded-md bg-surface-2 px-3 py-2 text-sm" value={previewGame.id} onChange={(e) => setPreviewId(e.target.value)}>
              {upcoming.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.sport} {g.away.abbr} @ {g.home.abbr} · {formatKick(g.startAt, "America/Los_Angeles")}
                </option>
              ))}
            </select>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-bg-elevated p-4 font-mono text-xs text-muted">
              {buildTestPreviewMessage(previewGame)}
            </pre>
            <p className="text-xs text-subtle">Same formatter as production. Test posts always say TEST / UNOFFICIAL.</p>
            <Button variant="secondary" size="sm" onClick={() => desk.testPost(previewGame.id)} disabled={desk.testing}>
              {desk.testing ? <Loader2 className="size-4 animate-spin" /> : null}
              Test send
            </Button>
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-sm tracking-[0.18em] text-muted uppercase">Odds API</h2>
        <p className="text-sm">DraftKings API · {health.oddsLabel}</p>
        <p className="text-xs text-subtle">Used {health.oddsUsed ?? "—"} · Free beta {health.freeBeta ? "ON" : "off"}</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-sm tracking-[0.18em] text-muted uppercase">Database</h2>
        <p className="text-sm">{health.dbLabel}</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-sm tracking-[0.18em] text-muted uppercase">Models</h2>
        <p className="text-xs text-subtle">Research only. Backtests are not a live record and never auto-promote.</p>
        {desk.data.researchModels ? (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-xl bg-surface p-3 shadow-border">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] tracking-[0.14em] text-muted uppercase">
                  <tr>
                    <th className="py-1">Sport</th>
                    <th>Production</th>
                    <th>Shadow</th>
                    <th>n</th>
                    <th>Brier</th>
                  </tr>
                </thead>
                <tbody>
                  {(desk.data.researchModels.sports ?? []).map((s) => (
                    <tr key={s.league} className="border-t border-white/5">
                      <td className="py-1.5 font-medium">{s.league}</td>
                      <td className="font-mono text-win">{s.production}</td>
                      <td className="font-mono text-push">{s.shadow ?? "—"}</td>
                      <td>{s.testN ?? "—"}</td>
                      <td>{s.brier == null ? "—" : s.brier.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-subtle">{desk.data.researchModels.note}</p>
            {desk.data.researchModels.shadowCompare ? (
              <div className="rounded-xl bg-bg-elevated p-4">
                <p className="text-[10px] tracking-[0.16em] text-muted uppercase">MLB shadow · overlapping games only</p>
                <p className="mt-2 font-mono text-xs text-fg">
                  n {desk.data.researchModels.shadowCompare.n} · V2 Brier{" "}
                  {desk.data.researchModels.shadowCompare.v2.brier?.toFixed(3) ?? "—"} · V3 Brier{" "}
                  {desk.data.researchModels.shadowCompare.v3.brier?.toFixed(3) ?? "—"}
                </p>
                <p className="mt-1 font-mono text-xs text-muted">
                  V2 acc {desk.data.researchModels.shadowCompare.v2.accuracy == null ? "—" : `${(desk.data.researchModels.shadowCompare.v2.accuracy * 100).toFixed(1)}%`}
                  {" · "}
                  V3 acc {desk.data.researchModels.shadowCompare.v3.accuracy == null ? "—" : `${(desk.data.researchModels.shadowCompare.v3.accuracy * 100).toFixed(1)}%`}
                </p>
                <p className="mt-2 text-[11px] text-subtle">{desk.data.researchModels.shadowCompare.note}</p>
              </div>
            ) : null}
            {desk.data.researchModels.audit?.length ? (
              <ul className="list-disc space-y-1 pl-4 text-[11px] text-subtle">
                {desk.data.researchModels.audit.slice(0, 4).map((line) => (
                  <li key={line.slice(0, 40)}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted">No V3 artifact. Ingest and train offline first.</p>
        )}
      </section>

      {desk.data.calibration ? <CalibrationPanel report={desk.data.calibration} /> : null}

      <section className="space-y-3">
        <h2 className="font-display text-sm tracking-[0.18em] text-muted uppercase">Logs</h2>
        <div className="flex flex-wrap gap-2">
          {["ALL", "ERROR", "WARNING", "POST", "GRADE", "SCAN"].map((k) => (
            <Button key={k} size="sm" variant={logKind === k ? "secondary" : "ghost"} onClick={() => setLogKind(k)}>
              {k}
            </Button>
          ))}
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-border">
          {logs.map((row) => (
            <li key={row.id} className="px-4 py-3">
              <p className="text-[10px] tracking-[0.14em] text-subtle uppercase">{row.kind}</p>
              <p className="text-sm text-fg">{row.message}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="rounded-xl bg-surface p-4 shadow-border">
      <span className="text-xs tracking-[0.14em] text-subtle uppercase">{label}</span>
      <Input className="mt-2" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ManualPick({ games }: { games: GameCard[] }) {
  const desk = useDesk();
  const [gameId, setGameId] = useState(games[0]?.id ?? "");
  const game = games.find((g) => g.id === gameId) ?? games[0];
  const choices = useMemo(() => {
    if (!game) return [];
    const out: Array<{ market: Market; side: Side; label: string }> = [];
    (["moneyline", "spread", "total"] as Market[]).forEach((market) => {
      const sides: Side[] = market === "total" ? ["over", "under"] : ["away", "home"];
      for (const side of sides) {
        const price = priceFor(game.odds, market, side);
        const line = lineFor(game.odds, market, side);
        if (price == null) continue;
        if (market !== "moneyline" && line == null) continue;
        out.push({
          market,
          side,
          label: selectionLabel({ market, side, homeAbbr: game.home.abbr, awayAbbr: game.away.abbr, line, price }),
        });
      }
    });
    return out;
  }, [game]);

  if (!game) return null;
  return (
    <div className="rounded-xl bg-surface p-4 shadow-border">
      <p className="text-xs tracking-[0.14em] text-push uppercase">Manual / not auto model selection</p>
      <select className="mt-2 w-full rounded-md bg-surface-2 px-3 py-2 text-sm" value={game.id} onChange={(e) => setGameId(e.target.value)}>
        {games.map((g) => (
          <option key={g.id} value={g.id}>
            {g.sport} {g.away.abbr} @ {g.home.abbr}
          </option>
        ))}
      </select>
      <div className="mt-3 flex flex-wrap gap-2">
        {choices.map((c) => (
          <Button key={`${c.market}-${c.side}`} size="sm" variant="ghost" onClick={() => desk.manualPost({ gameId: game.id, market: c.market, side: c.side })} disabled={desk.posting}>
            Post {c.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function CalibrationPanel({ report }: { report: CalibrationReport }) {
  return (
    <section>
      <h2 className="mb-2 font-display text-sm tracking-[0.18em] text-muted uppercase">Calibration</h2>
      <p className="text-xs text-subtle">{report.note}</p>
      <div className="mt-3 overflow-x-auto rounded-xl bg-surface p-4 shadow-border">
        <table className="w-full text-left font-mono text-xs tabular-nums text-muted">
          <thead>
            <tr>
              <th className="pb-2">Bucket</th>
              <th>n</th>
              <th>Actual</th>
              <th>Expect</th>
            </tr>
          </thead>
          <tbody>
            {report.buckets.map((b) => (
              <tr key={b.key} className="border-t border-border">
                <td className="py-1.5 text-fg">{b.key}%</td>
                <td>{b.decided}</td>
                <td>{b.actualWinRate == null ? "—" : `${(b.actualWinRate * 100).toFixed(1)}%`}</td>
                <td>{b.expectedWinRate == null ? "—" : `${(b.expectedWinRate * 100).toFixed(1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
