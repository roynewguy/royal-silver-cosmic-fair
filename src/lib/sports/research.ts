import { getSql } from "@/lib/db";
import { isFreeBetaMode } from "./free-beta.ts";
import type { GameCard } from "./types.ts";
import { parseResearchPlays, type AiPlay } from "./research-schema.ts";

export type { AiPlay } from "./research-schema.ts";
export { fingerprintResearch, parseResearchPlays, shouldRefreshResearch } from "./research-schema.ts";

export async function loadCachedResearch(gameId: string): Promise<{
  fingerprint: string;
  skip: boolean;
  reason: string;
  skipReason: string | null;
  ageMs: number;
} | null> {
  const sql = await getSql();
  const rows = await sql<{
    fingerprint: string;
    skip: boolean;
    reason: string;
    skip_reason: string | null;
    updated_at: unknown;
  }>`select fingerprint, skip, reason, skip_reason, updated_at from research_cache where game_id = ${gameId}`;
  const row = rows[0];
  if (!row) return null;
  const at = new Date(String(row.updated_at)).getTime();
  return {
    fingerprint: row.fingerprint,
    skip: row.skip,
    reason: row.reason,
    skipReason: row.skip_reason,
    ageMs: Number.isFinite(at) ? Date.now() - at : 0,
  };
}

export async function saveCachedResearch(gameId: string, fp: string, play: AiPlay): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into research_cache (game_id, fingerprint, skip, reason, skip_reason, updated_at)
    values (${gameId}, ${fp}, ${play.skip}, ${play.reason}, ${play.skipReason ?? null}, now())
    on conflict (game_id) do update set
      fingerprint = excluded.fingerprint,
      skip = excluded.skip,
      reason = excluded.reason,
      skip_reason = excluded.skip_reason,
      updated_at = now()
  `;
}

export async function researchPlays(candidates: GameCard[]): Promise<AiPlay[] | null> {
  if (isFreeBetaMode()) return null;
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey || candidates.length === 0) return null;
  const payload = candidates.slice(0, 6).map((g) => ({
    gameId: g.id,
    sport: g.sport,
    matchup: `${g.away.name} @ ${g.home.name}`,
    kick: g.startAt,
    records: { home: g.home.record, away: g.away.record, homeSplit: g.home.homeSplit, awayRoadSplit: g.away.roadSplit },
    starters: { home: g.home.starter, away: g.away.starter },
    odds: { homeMl: g.odds.homeMl, awayMl: g.odds.awayMl, homeSpread: g.odds.homeSpread, total: g.odds.total },
    ranked: g.rank ? { market: g.rank.market, side: g.rank.side, selection: g.rank.selection } : null,
    injuries: g.injuries,
    notes: g.notes,
    weather: g.weather,
    venue: g.venue,
  }));
  const allowed = payload.map((p) => p.gameId);
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(16_000),
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.2,
        max_tokens: 700,
        tools: [{ type: "web_search" }],
        messages: [
          {
            role: "system",
            content:
              "Senior handicapper for Picks Boat Boyz. APPROVE or PASS only. One or two sentences. Do not pick a market, side, odds, units, or confidence. JSON only: {\"plays\":[{\"gameId\":\"...\",\"skip\":false,\"reason\":\"...\"}]}",
          },
          {
            role: "user",
            content: `Candidates:\n${JSON.stringify(payload)}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      if (res.status === 422) return researchPlaysNoTools(apiKey, payload, allowed);
      return null;
    }
    return parseResearchPlays(await res.json(), allowed);
  } catch {
    return null;
  }
}

async function researchPlaysNoTools(apiKey: string, payload: unknown, allowed: string[]): Promise<AiPlay[] | null> {
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content: "APPROVE or PASS only. JSON {plays:[{gameId,skip,reason}]}. No confidence, units, market, or side.",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });
    if (!res.ok) return null;
    return parseResearchPlays(await res.json(), allowed);
  } catch {
    return null;
  }
}
