import type { AutomationStatus, DeskHealth, ServiceLevel } from "../sports/types.ts";

export type { AutomationStatus, DeskHealth, ServiceLevel };

export const TICK_EVERY_MS = 10 * 60_000;
export const TICK_ONLINE_MS = 15 * 60_000;
export const TICK_DELAYED_MS = 25 * 60_000;

export function automationStatus(lastCronTickAt: string | null | undefined, now = Date.now()): AutomationStatus {
  if (!lastCronTickAt) return "unarmed";
  const t = new Date(lastCronTickAt).getTime();
  if (!Number.isFinite(t)) return "unarmed";
  const age = now - t;
  if (age <= TICK_ONLINE_MS) return "online";
  if (age <= TICK_DELAYED_MS) return "delayed";
  return "offline";
}

export function nextScanIso(
  lastCronTickAt: string | null | undefined,
  lastScanAt: string | null | undefined,
  _now = Date.now(),
): string | null {
  const base = lastCronTickAt ?? lastScanAt;
  if (!base) return null;
  const t = new Date(base).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + TICK_EVERY_MS).toISOString();
}

export function oddsService(remaining: number | null | undefined): ServiceLevel {
  if (remaining == null) return "warn";
  if (remaining <= 0) return "bad";
  if (remaining < 50) return "warn";
  return "ok";
}

export function espnService(lastScanAt: string | null | undefined, errorCount: number, now = Date.now()): ServiceLevel {
  if (errorCount > 0) return "warn";
  if (!lastScanAt) return "warn";
  const t = new Date(lastScanAt).getTime();
  if (!Number.isFinite(t) || now - t > TICK_DELAYED_MS) return "warn";
  return "ok";
}

export function buildDeskHealth(input: {
  lastTickAt: string | null;
  lastScanAt: string | null;
  hasWebhook: boolean;
  dbSource: string;
  espnErrors: number;
  oddsRemaining: number | null;
  oddsUsed: number | null;
  freeBeta: boolean;
  now?: number;
}): DeskHealth {
  const now = input.now ?? Date.now();
  const auto = automationStatus(input.lastTickAt, now);
  const dbOk = input.dbSource === "neon" || input.dbSource === "pglite";
  return {
    automation: auto,
    lastTickAt: input.lastTickAt,
    lastScanAt: input.lastScanAt,
    nextScanAt: nextScanIso(input.lastTickAt, input.lastScanAt, now),
    db: dbOk ? "ok" : "bad",
    dbLabel: input.dbSource === "neon" ? "Neon connected" : input.dbSource === "pglite" ? "Preview database" : "Database unavailable",
    espn: espnService(input.lastScanAt, input.espnErrors, now),
    discord: input.hasWebhook ? "ok" : "bad",
    discordLabel: input.hasWebhook ? "Connected" : "Webhook missing",
    odds: oddsService(input.oddsRemaining),
    oddsLabel:
      input.oddsRemaining == null
        ? "No Odds API reading yet"
        : input.oddsRemaining <= 0
          ? "API credits exhausted. Fresh cached DK only."
          : `${input.oddsRemaining} credits remaining`,
    oddsRemaining: input.oddsRemaining,
    oddsUsed: input.oddsUsed,
    freeBeta: input.freeBeta,
  };
}

export const EMPTY_HEALTH: DeskHealth = buildDeskHealth({
  lastTickAt: null,
  lastScanAt: null,
  hasWebhook: false,
  dbSource: "none",
  espnErrors: 0,
  oddsRemaining: null,
  oddsUsed: null,
  freeBeta: true,
});

