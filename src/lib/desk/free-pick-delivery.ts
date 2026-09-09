import { getSql } from "../db";
import { ptDayKey } from "../sports/day";
import {
  buildOfficialPickPayload,
  postWebhook,
  resolvePickTier,
} from "../sports/discord";
import { channelWebhook } from "../sports/discord-routing";
import { dailyFreePickTarget, freeCandidatesFromOfficial, selectFreePickOfDay } from "../sports/free-pick";
import { isPaperMode } from "../sports/paper-mode";
import type { GameCard } from "../sports/types";
import { livePostingEnabled } from "./production-policy";
import { addLog, loadTodayOfficial } from "./store";
import { recordEvent } from "./telemetry";
import { alertOwner } from "./alerts";

/**
 * At most one free #free-picks post per PT day.
 * Reuses the VIP official embed for a already-posted card pick.
 * Tracks delivery in free_pick_delivery — does not invent a second ledger.
 */
export async function maybePostDailyFreePick(games: GameCard[]): Promise<boolean> {
  if (!livePostingEnabled() || isPaperMode()) return false;
  if (dailyFreePickTarget() < 1) return false;
  const hook = channelWebhook("free");
  if (!hook) return false;

  const day = ptDayKey();
  const sql = await getSql();
  const existing = await sql<{ pt_day: string }>`select pt_day from free_pick_delivery where pt_day = ${day}`;
  if (existing.length) return false;

  const official = await loadTodayOfficial();
  const selected = selectFreePickOfDay(freeCandidatesFromOfficial(official));
  if (!selected) return false;
  const pick = official.find((p) => p.id === selected.id);
  if (!pick || (pick.status !== "posted" && pick.status !== "graded")) return false;

  const claim = await sql<{ pt_day: string }>`
    insert into free_pick_delivery (pt_day, pick_id, state)
    values (${day}, ${pick.id}, 'sending')
    on conflict do nothing
    returning pt_day
  `;
  if (!claim.length) return false;

  const game = games.find((g) => g.id === pick.gameId) ?? null;
  const payload = buildOfficialPickPayload(pick, game);
  try {
    const sent = await postWebhook(hook, payload);
    if (!sent.ok || !sent.id) {
      await sql`
        update free_pick_delivery
        set state = ${sent.uncertain ? "delivery_unknown" : "sending"},
            updated_at = now()
        where pt_day = ${day}
      `;
      // Definitive failure: clear fence so a later tick can retry once.
      if (!sent.uncertain) {
        await sql`delete from free_pick_delivery where pt_day = ${day} and state = 'sending' and message_id is null`;
      }
      await recordEvent(sent.uncertain ? "delivery_unknown" : "discord_failure", "Free picks delivery failed");
      await alertOwner("DISCORD_FAIL", "Free picks post failed; inspect #free-picks before any resend.");
      return false;
    }
    await sql`
      update free_pick_delivery
      set state = 'sent', message_id = ${sent.id}, updated_at = now()
      where pt_day = ${day}
    `;
    await recordEvent("discord_free_success");
    const tier = resolvePickTier(pick);
    await addLog(
      "post",
      `FREE channel · ${tier === "soft_floor" ? "BEST AVAILABLE / DESK" : "LOCK"} · ${pick.selection} · msg ${sent.id}`,
      pick.sport,
    );
    return true;
  } catch {
    await sql`
      update free_pick_delivery set state = 'delivery_unknown', updated_at = now()
      where pt_day = ${day} and state = 'sending'
    `;
    await alertOwner("DISCORD_FAIL", "Free picks confirmation could not be stored; do not resend.");
    return false;
  }
}
