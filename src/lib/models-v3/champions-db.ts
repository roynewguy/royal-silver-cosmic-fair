import { getSql } from "@/lib/db";
import {
  applyChampionSnapshot,
  allChampions,
  allPreviousChampions,
  CHAMPION_SPORTS,
  DEFAULT_CHAMPIONS,
  type ChampionAction,
  type ChampionSport,
} from "./champions.ts";

export async function hydrateChampionsFromDb(): Promise<void> {
  try {
    const sql = await getSql();
    const rows = await sql<{
      sport: string;
      champion_version: string;
      previous_version: string | null;
    }>`select sport, champion_version, previous_version from sport_champions`;
    const verifiedRows = await sql<{
      sport: string;
      model_version: string;
    }>`select sport, model_version from sport_model_verification`;
    const champions: Partial<Record<string, string>> = {};
    const previous: Partial<Record<string, string | null>> = {};
    for (const sport of CHAMPION_SPORTS) {
      champions[sport] = DEFAULT_CHAMPIONS[sport];
      previous[sport] = null;
    }
    for (const row of rows) {
      champions[row.sport] = row.champion_version;
      previous[row.sport] = row.previous_version;
    }
    applyChampionSnapshot({
      champions,
      previous,
      verified: verifiedRows.map((r) => ({ sport: r.sport, version: r.model_version })),
    });
  } catch {
    /* table may not exist yet — keep in-memory V2 defaults */
  }
}

export async function persistVerification(input: {
  sport: ChampionSport;
  version: string;
  operatorId?: string | null;
  reason?: string | null;
}): Promise<void> {
  try {
    const sql = await getSql();
    await sql`
      insert into sport_model_verification (model_version, sport, operator_id, reason)
      values (${input.version}, ${input.sport}, ${input.operatorId ?? "operator"}, ${input.reason ?? "CEO verified challenger"})
      on conflict (model_version, sport) do update set
        verified_at = now(),
        operator_id = excluded.operator_id,
        reason = excluded.reason
    `;
    await sql`
      update model_registry
      set verified = true
      where model_version = ${input.version} and sport = ${input.sport}
    `;
    await sql`
      insert into sport_champion_history (sport, action, from_version, to_version, operator_id, reason)
      values (${input.sport}, 'verify', ${allChampions()[input.sport]}, ${input.version}, ${input.operatorId ?? "operator"}, ${input.reason ?? "CEO verified challenger"})
    `;
    await sql`
      insert into model_promotion_log (sport, from_version, to_version, action, live_posting, operator_id, reason, stats_json)
      values (${input.sport}, ${allChampions()[input.sport]}, ${input.version}, 'verify', false, ${input.operatorId ?? "operator"}, ${input.reason ?? "CEO verified challenger"}, '{}')
    `;
  } catch {
    /* persistence must not block in-memory champion state */
  }
}

export async function persistChampionChange(input: {
  sport: ChampionSport;
  action: Extract<ChampionAction, "promote" | "rollback">;
  fromVersion: string | null;
  toVersion: string;
  operatorId?: string | null;
  reason?: string | null;
}): Promise<void> {
  try {
    const sql = await getSql();
    const prev = allPreviousChampions()[input.sport] ?? null;
    await sql`
      insert into sport_champions (sport, champion_version, previous_version, promoted_by, reason, promoted_at)
      values (${input.sport}, ${input.toVersion}, ${prev}, ${input.operatorId ?? "operator"}, ${input.reason ?? input.action}, now())
      on conflict (sport) do update set
        champion_version = excluded.champion_version,
        previous_version = excluded.previous_version,
        promoted_by = excluded.promoted_by,
        reason = excluded.reason,
        promoted_at = now()
    `;
    await sql`
      insert into sport_champion_history (sport, action, from_version, to_version, operator_id, reason)
      values (${input.sport}, ${input.action}, ${input.fromVersion}, ${input.toVersion}, ${input.operatorId ?? "operator"}, ${input.reason ?? input.action})
    `;
    await sql`
      insert into model_promotion_log (sport, from_version, to_version, action, live_posting, operator_id, reason, stats_json)
      values (${input.sport}, ${input.fromVersion}, ${input.toVersion}, ${input.action}, true, ${input.operatorId ?? "operator"}, ${input.reason ?? input.action}, '{}')
    `;
    await sql`
      update model_registry
      set role = 'challenger'
      where sport = ${input.sport} and role = 'champion' and model_version <> ${input.toVersion}
    `;
    await sql`
      update model_registry
      set role = 'champion', status = 'production', verified = true
      where sport = ${input.sport} and model_version = ${input.toVersion}
    `;
  } catch {
    /* persistence must not block in-memory champion state */
  }
}
