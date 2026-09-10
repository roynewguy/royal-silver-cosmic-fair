import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { pickFromRow } from "@/lib/desk/store";
import {
  canAccessPicks,
  emptyMembership,
  membershipFromRow,
  type Membership,
} from "./membership";
import { buildOfficialBook, type OfficialBook } from "./official";

type OfficialDbRow = Parameters<typeof pickFromRow>[0];

async function loadOfficialRows(): Promise<ReturnType<typeof pickFromRow>[]> {
  const sql = await getSql();
  const rows = await sql<OfficialDbRow>`
    select p.*, g.home_logo, g.away_logo, g.home_abbr, g.away_abbr,
           g.home_score, g.away_score, g.status as game_status
    from picks p
    left join games g on g.id = p.game_id
    where coalesce(p.ledger, 'official') = 'official'
      and p.status in ('posted', 'graded')
      and coalesce(p.pick_source, 'auto') = 'auto'
      and p.official_key is not null
    order by coalesce(p.posted_at, p.created_at) desc
  `;
  return rows.map(pickFromRow);
}

export async function loadOfficialBook(): Promise<OfficialBook> {
  const rows = await loadOfficialRows();
  return buildOfficialBook(rows);
}

export const getOfficialBook = createServerFn({ method: "GET" }).handler(async () => {
  return loadOfficialBook();
});

export const getMyMembership = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ membership: Membership; picksAccess: boolean }> => {
    const sql = await getSql();
    const rows = await sql<{
      provider: string | null;
      status: string | null;
      plan_id: string | null;
      external_id: string | null;
      current_period_end: string | Date | null;
    }>`
      select provider, status, plan_id, external_id, current_period_end
      from memberships
      where user_id = ${context.userId}
      limit 1
    `;
    const membership = rows[0]
      ? membershipFromRow(context.userId, rows[0])
      : emptyMembership(context.userId);
    return { membership, picksAccess: canAccessPicks(membership) };
  });
