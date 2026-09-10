import { getSql } from "../db.ts";
import { channelWebhook, webhooksIsolated, type DiscordRole } from "../sports/discord-routing.ts";
import { livePostingEnabled } from "./production-policy.ts";
import { automationStatus, espnService } from "./health.ts";
import { isPaperMode } from "../sports/paper-mode.ts";
import { LEAGUES } from "../sports/leagues.ts";
import { evaluatePreflightVerdict, type PreflightCheck } from "./preflight-verdict.ts";

export type { PreflightStatus, PreflightCheck } from "./preflight-verdict.ts";
export { evaluatePreflightVerdict } from "./preflight-verdict.ts";

export type Preflight = {
  livePosting: boolean;
  paper: boolean;
  verdict: "GREEN" | "RED";
  verdictReason: string;
  checks: PreflightCheck[];
  counts: Record<string, number>;
  lastPostAt: string | null;
  lastGradeAt: string | null;
  lastError: string | null;
};

export async function loadPreflight(lastTickAt: string | null, stored: string): Promise<Preflight> {
  const sql = await getSql();
  const events = await sql<{kind: string; n: number; latest: string}>`
    select kind, count(*)::integer as n, max(created_at)::text as latest from operational_events
    where created_at >= now() - interval '24 hours' group by kind`;
  const latest = Object.fromEntries(events.map(e => [e.kind, e.latest]));
  const counts = Object.fromEntries(events.map(e => [e.kind, Number(e.n)]));
  const totals = await sql<{official: number; graded: number; pending: number}>`
    select count(*) filter (where posted_at >= now() - interval '24 hours')::integer as official,
      count(*) filter (where graded_at >= now() - interval '24 hours')::integer as graded,
      count(*) filter (where status = 'posted' and result is null)::integer as pending
    from picks where ledger = 'official' and pick_source = 'auto' and official_key is not null`;
  const stamps = await sql<{last_post: string | null; last_grade: string | null}>`
    select max(posted_at)::text as last_post, max(graded_at)::text as last_grade from picks where ledger = 'official'`;
  const errors = await sql<{kind: string; detail: string; at: string}>`
    select kind, detail, created_at::text as at from operational_events
    where kind like '%failure' or kind in ('delivery_unknown','ambiguous_match') order by id desc limit 1`;
  const unknown = await sql<{ n: number }>`
    select count(*)::integer as n from picks
    where status = 'delivery_unknown' or result_delivery = 'delivery_unknown'`;
  const keys = ["cron_success", "cron_failure", "espn_failure", "dk_failure", "discord_failure", "delivery_unknown", "db_failure", "ambiguous_match", "stale_pass"];
  const isolated = webhooksIsolated();
  const checks: Preflight["checks"] = [
    { name: "Automation", status: automationStatus(lastTickAt) === "online" ? "READY" : "BLOCKED", detail: automationStatus(lastTickAt).toUpperCase(), critical: true },
    { name: "Database", status: "READY", detail: "Read completed", critical: true },
    { name: "ESPN", status: espnService(latest.scan_success,
      Date.parse(latest.espn_failure ?? "") >= Date.parse(latest.scan_success ?? "") ? 1 : 0) === "ok" ? "READY" : "UNVERIFIED",
      detail: latest.scan_success ?? "No successful complete scan in 24h", critical: true },
    { name: "Odds API", status: latest.odds_api_success ? "READY" : "UNVERIFIED", detail: latest.odds_api_success ?? "No verified response in 24h", critical: true },
    { name: "DraftKings exact-event verification", status: latest.dk_success ? "READY" : "UNVERIFIED", detail: latest.dk_success ?? "No exact-event verification in 24h" },
    { name: "Truth gate", status: "READY", detail: "Required on every automated/paper post" },
    { name: "New automated customer picks", status: livePostingEnabled() ? "READY" : "BLOCKED", detail: livePostingEnabled() ? "Enabled" : "Kill switch OFF (scans and grading continue)" },
    {
      name: "Webhook isolation",
      status: isolated ? "READY" : "BLOCKED",
      detail: isolated ? "picks / results / alerts are distinct" : "Official, results, or alerts webhook missing or colliding",
      critical: true,
    },
  ];
  for (const role of ["picks", "results", "alerts", "test", "manual", "record", "weekly", "free", "lab"] as DiscordRole[]) {
    const configured = Boolean(channelWebhook(role, stored));
    const proven = latest[`discord_${role}_success`];
    const critical = role === "picks" || role === "results" || role === "alerts";
    checks.push({
      name: `Discord ${role}`,
      status: !configured ? "BLOCKED" : proven ? "READY" : "UNVERIFIED",
      detail: !configured ? "Missing or conflicting channel" : proven ?? "Configured; no confirmed delivery in 24h",
      critical,
    });
  }
  for (const league of LEAGUES) checks.push({ name: `${league.sport} model`, status: league.official ? "UNVERIFIED" : "BLOCKED", detail: league.official ? `Existing v2-${league.id}; live data/validation must be reviewed before launch` : league.id === "ncaab" ? "Generic fallback disabled; dedicated validation needed" : "Three-way markets not supported" });
  const deliveryUnknown = Number(unknown[0]?.n ?? counts.delivery_unknown ?? 0);
  const judged = evaluatePreflightVerdict({ checks, deliveryUnknown });
  return {
    livePosting: livePostingEnabled(),
    paper: isPaperMode(),
    verdict: judged.verdict,
    verdictReason: judged.reason,
    checks,
    counts: {
      expected_cron_ticks: 144,
      ...Object.fromEntries(keys.map(k => [k, counts[k] ?? 0])),
      official_picks: Number(totals[0]?.official ?? 0),
      graded_picks: Number(totals[0]?.graded ?? 0),
      pending_picks: Number(totals[0]?.pending ?? 0),
      delivery_unknown_open: deliveryUnknown,
    },
    lastPostAt: stamps[0]?.last_post ?? null,
    lastGradeAt: stamps[0]?.last_grade ?? null,
    lastError: errors[0] ? `${errors[0].at}: ${errors[0].kind} ${errors[0].detail}` : null,
  };
}
