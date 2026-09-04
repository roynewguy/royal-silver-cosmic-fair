import { createHash } from "node:crypto";
import { z } from "zod";
import type { GameCard } from "./types.ts";

export type AiPlay = {
  gameId: string;
  skip: boolean;
  skipReason?: string;
  reason: string;
};

const PlaySchema = z.object({
  gameId: z.string().min(1),
  skip: z.boolean(),
  skipReason: z.string().optional(),
  reason: z.string(),
});

const BodySchema = z.object({
  plays: z.array(PlaySchema),
});

export function fingerprintResearch(game: GameCard): string {
  const payload = {
    id: game.id,
    spread: game.odds.homeSpread,
    ml: game.odds.homeMl,
    total: game.odds.total,
    injuries: (game.injuries ?? []).map((i) => `${i.team}:${i.player}:${i.status}`).sort(),
    starters: [game.home.starter?.name ?? "", game.away.starter?.name ?? ""],
    weather: game.weather ?? "",
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
}

export function parseResearchPlays(body: unknown, allowedIds: string[]): AiPlay[] | null {
  const text =
    typeof body === "string"
      ? body
      : ((body as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "");
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) return null;
  let json: unknown;
  try {
    json = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return null;
  const allow = new Set(allowedIds);
  return parsed.data.plays
    .filter((p) => allow.has(p.gameId))
    .map((p) => ({
      gameId: p.gameId,
      skip: p.skip,
      skipReason: p.skipReason,
      reason: p.reason.trim().slice(0, 420),
    }));
}

export function shouldRefreshResearch(input: {
  cachedFingerprint: string | null;
  currentFingerprint: string;
  cacheAgeMs: number;
  hoursToKick: number;
  postLeadHours: number;
}): boolean {
  if (!input.cachedFingerprint) return true;
  if (input.cachedFingerprint !== input.currentFingerprint) return true;
  const nearPost = input.hoursToKick <= input.postLeadHours + 0.4 && input.hoursToKick > 0;
  if (nearPost && input.cacheAgeMs > 20 * 60_000) return true;
  return false;
}
