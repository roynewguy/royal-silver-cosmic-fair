import { discordWebhookOk, postWebhook, buildNoPlayPayload, buildNoPlayMessage } from "./discord.ts";
import { channelWebhook, webhookIdentity } from "./discord-routing.ts";
import { formatAmerican } from "../utils.ts";
import type { GameCard, ModelCall } from "./types.ts";
import { isShadowSoak, livePostingEnabled } from "../desk/production-policy.ts";

export const MODEL_LAB_USERNAME = "BoatBoyz Model Lab";

export { buildNoPlayMessage };

export function resolveModelLabWebhook(officialUrl?: string | null): { url: string; reason: string | null } {
  const raw = process.env.DISCORD_MODEL_LAB_WEBHOOK?.trim() ?? "";
  const official = officialUrl?.trim() ?? process.env.DISCORD_WEBHOOK_URL?.trim() ?? process.env.DISCORD_PICKS_WEBHOOK?.trim() ?? "";
  if (raw && official && webhookIdentity(raw) === webhookIdentity(official)) {
    return { url: "", reason: "collides with official picks webhook" };
  }
  const url = channelWebhook("lab");
  if (!url) {
    if (!raw || !discordWebhookOk(raw)) return { url: "", reason: "unset" };
    return { url: "", reason: "collides with a customer or ops webhook" };
  }
  return { url, reason: null };
}

export function buildShadowLabMessage(game: GameCard, call: ModelCall): string {
  const side = call.side === "away" ? game.away.abbr : game.home.abbr;
  const price = call.price != null ? formatAmerican(call.price) : "—";
  const modelPct = (call.probability * 100).toFixed(1);
  const mkt = call.marketProbability != null ? `${(call.marketProbability * 100).toFixed(1)}%` : "—";
  const edge = call.edgePct != null ? `${call.edgePct >= 0 ? "+" : ""}${call.edgePct.toFixed(1)}%` : "—";
  const ev = call.expectedValuePct != null ? `${call.expectedValuePct >= 0 ? "+" : ""}${call.expectedValuePct.toFixed(1)}%` : "—";
  const dq = call.dataQuality != null ? `${Math.round(call.dataQuality)}/100` : "—";
  return [
    `🧪 ${call.model.toUpperCase()} SHADOW`,
    `${side} ML ${price}`,
    `Model: ${modelPct}%`,
    `Market: ${mkt}`,
    `Edge: ${edge}`,
    `EV: ${ev}`,
    `Data quality: ${dq}`,
    "",
    "NOT AN OFFICIAL PICK",
  ].join("\n");
}

export function noPlayEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.DISCORD_NO_PLAY_ENABLED?.trim().toLowerCase() ?? "";
  return raw === "1" || raw === "true" || raw === "yes";
}

export function canPostShadowLab(call: ModelCall, officialUrl?: string | null, env: NodeJS.ProcessEnv = process.env): { ok: true; url: string } | { ok: false; reason: string } {
  if (isShadowSoak(env)) return { ok: false, reason: "shadow soak kills model-lab Discord" };
  if (call.official) return { ok: false, reason: "official flag set on shadow call" };
  if (call.action !== "BET") return { ok: false, reason: "shadow did not qualify" };
  const hook = resolveModelLabWebhook(officialUrl);
  if (!hook.url) return { ok: false, reason: hook.reason ?? "unset" };
  return { ok: true, url: hook.url };
}

export function buildShadowLabDigest(games: GameCard[]): string | null {
  const lines: string[] = ["🧪 MODEL LAB", "Shadow candidates only. NOT AN OFFICIAL PICK", ""];
  let n = 0;
  for (const game of games) {
    for (const call of [game.shadows?.v4, game.shadows?.v3]) {
      if (!call || call.official || call.action !== "BET") continue;
      const side = call.side === "away" ? game.away.abbr : game.home.abbr;
      const price = call.price != null ? formatAmerican(call.price) : "—";
      const edge = call.edgePct != null ? `${call.edgePct >= 0 ? "+" : ""}${call.edgePct.toFixed(1)}%` : "—";
      lines.push(`${call.model} · ${game.league.toUpperCase()} ${side} ML ${price} · edge ${edge}`);
      n += 1;
      if (n >= 8) break;
    }
    if (n >= 8) break;
  }
  if (n === 0) return null;
  lines.push("", "NOT AN OFFICIAL PICK");
  return lines.join("\n");
}

export async function postShadowLabSlate(games: GameCard[], officialUrl?: string | null): Promise<number> {
  // SHADOW_SOAK = zero Discord of any kind, including Model Lab digests.
  if (isShadowSoak()) return 0;
  const hook = resolveModelLabWebhook(officialUrl);
  if (!hook.url) return 0;
  const digest = buildShadowLabDigest(games);
  if (!digest) return 0;
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const recent = await sql<{ lab_post_at: string | null }>`select lab_post_at::text as lab_post_at from desk_meta where id = 1`;
    const last = recent[0]?.lab_post_at ? Date.parse(recent[0].lab_post_at) : 0;
    if (Number.isFinite(last) && Date.now() - last < 3 * 3600_000) return 0;
    const sent = await postWebhook(hook.url, digest, { username: MODEL_LAB_USERNAME });
    if (!sent.ok) return 0;
    await sql`update desk_meta set lab_post_at = now(), updated_at = now() where id = 1`;
    return 1;
  } catch {
    return 0;
  }
}

export async function maybePostNoPlay(officialUrl: string, ptDay: string): Promise<boolean> {
  if (!livePostingEnabled()) return false;
  if (!noPlayEnabled()) return false;
  if (!discordWebhookOk(officialUrl)) return false;
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ no_play_on: string | null }>`select no_play_on from desk_meta where id = 1`;
    if (rows[0]?.no_play_on === ptDay) return false;
    const sent = await postWebhook(officialUrl, buildNoPlayPayload());
    if (!sent.ok) return false;
    await sql`update desk_meta set no_play_on = ${ptDay}, updated_at = now() where id = 1`;
    return true;
  } catch {
    return false;
  }
}
