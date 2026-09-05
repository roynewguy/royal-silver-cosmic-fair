import type { Sql } from "../db";
import type { ClaimStore, CompletePayload } from "./post-pipeline.ts";
import { newPostingToken } from "./post-pipeline.ts";

export function sqlLocker(sql: Sql, policy?: { workerToken: string; target: number; ledger: string }): ClaimStore {
  return {
    async claim(id) {
      const token = newPostingToken();
      const rows = await sql<{ posting_token: string }>`
        update picks
        set status = 'posting', posting_started_at = now(), posting_at = now(), posting_token = ${token}
        where id = ${id} and status = 'queued' and freeze_json is null
        and (${policy?.workerToken ?? null}::text is null or (
          (picks.start_at at time zone 'America/Los_Angeles')::date = (now() at time zone 'America/Los_Angeles')::date
          and exists (select 1 from desk_meta where id = 1 and worker_lock_token = ${policy?.workerToken ?? null} and worker_lock_until > now())
          and (select count(*) from picks committed where committed.id <> ${id}
            and committed.ledger = ${policy?.ledger ?? 'official'} and committed.pick_source = 'auto'
            and committed.status in ('posting','posted','graded','delivery_unknown')
            and (committed.start_at at time zone 'America/Los_Angeles')::date = (now() at time zone 'America/Los_Angeles')::date) < ${policy?.target ?? 3}
        ))
        returning posting_token
      `;
      return rows[0]?.posting_token ?? null;
    },
    async release(id, token) {
      await sql`
        update picks
        set status = 'queued', freeze_json = null, posting_started_at = null, posting_at = null, posting_token = null
        where id = ${id} and status = 'posting' and posting_token = ${token}
      `;
    },
    async prepare(id, token, payload) {
      const rows = await sql<{ id: number }>`
        update picks set
          status = 'posting',
          selection = ${payload.selection},
          market = ${payload.market},
          side = ${payload.side},
          locked_odds = ${payload.lockedOdds},
          locked_line = ${payload.lockedLine},
          locked_odds_json = ${payload.lockedOddsJson},
          edge_pct = ${payload.edgePct},
          confidence = ${payload.confidence},
          units = ${payload.units},
          model_version = ${payload.modelVersion},
          model_probability = ${payload.modelProbability},
          model_edge = ${payload.modelEdge},
          posted_odds = ${payload.postedOdds},
          selected_odds = ${payload.selectedOdds},
          freeze_json = ${payload.freezeJson},
          discord_message = ${payload.discordMessage},
          reason = coalesce((${payload.freezeJson}::jsonb)->>'reason', reason)
        where id = ${id} and status = 'posting' and posting_token = ${token} and freeze_json is null
        returning id
      `;
      return rows.length > 0;
    },
    async complete(id, token, payload: CompletePayload) {
      const rows = await sql<{id: number}>`
        update picks set status = 'posted', posted_at = now(), discord_message_id = ${payload.discordMessageId},
          posting_token = null, posting_started_at = null, posting_at = null
        where id = ${id} and status = 'posting' and posting_token = ${token} and freeze_json is not null returning id`;
      return rows.length > 0;
    },
    async unknown(id, token) {
      await sql`update picks set status = 'delivery_unknown', skip_reason = 'DELIVERY_UNKNOWN'
        where id = ${id} and status = 'posting' and posting_token = ${token}`;
    },
    async status(id) {
      const rows = await sql<{ status: string }>`select status from picks where id = ${id}`;
      return (rows[0]?.status as import("@/lib/sports/types").PickStatus) ?? null;
    },
  };
}

