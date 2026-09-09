import { getSql } from "../db";
import { channelWebhook } from "../sports/discord-routing";
import { summarizeClv, type ClvSummary } from "../sports/closing";
import { weeklyPeriod } from "../sports/weekly-recap";
import { buildWeeklyRecapPayload } from "../sports/discord";
import { syncPersistentMessage } from "./scoreboard";
import { loadRecord } from "./store";

/** One frozen summary per PT week; same worker lease and delivery fence as the scoreboard. */
export async function sendWeeklyRecap(now = new Date()): Promise<void> {
  if (!channelWebhook("weekly")) return;
  const period = weeklyPeriod(now);
  const sql = await getSql();
  const [first] = await sql<{first_day:string|null}>`select min((start_at at time zone 'America/Los_Angeles')::date)::text as first_day
    from picks where ledger='official' and coalesce(pick_source,'auto')='auto' and official_key is not null and posted_at is not null`;
  // Do not fabricate reports for weeks before the official service began.
  if (!first?.first_day || first.first_day >= period.end) return;
  const purpose = `weekly:${period.start}`;
  const [existing] = await sql<{state:string}>`select state from discord_scoreboard where purpose=${purpose}`;
  if (existing?.state === "sent") return;
  const [r] = await sql<{wins:number;losses:number;pushes:number;voids:number;units:number;risked:number;pending:number}>`
    select count(*) filter(where status='graded' and result='WIN')::int as wins,
      count(*) filter(where status='graded' and result='LOSS')::int as losses,
      count(*) filter(where status='graded' and result='PUSH')::int as pushes,
      count(*) filter(where status='graded' and result='VOID')::int as voids,
      coalesce(sum(profit_units) filter(where status='graded'),0) as units,
      coalesce(sum(units) filter(where status='graded' and result in ('WIN','LOSS','PUSH')),0) as risked,
      count(*) filter(where status='posted' and result is null)::int as pending
    from picks where ledger='official' and coalesce(pick_source,'auto')='auto' and official_key is not null and posted_at is not null
      and (start_at at time zone 'America/Los_Angeles')::date >= ${period.start}::date
      and (start_at at time zone 'America/Los_Angeles')::date < ${period.end}::date`;
  const week = { wins:Number(r?.wins??0),losses:Number(r?.losses??0),pushes:Number(r?.pushes??0),voids:Number(r?.voids??0),
    units:Number(r?.units??0),riskedUnits:Number(r?.risked??0),pending:Number(r?.pending??0) };
  const clvRows = await sql<{clv:number|null}>`
    select clv from picks
    where ledger='official' and coalesce(pick_source,'auto')='auto' and official_key is not null and posted_at is not null
      and status='graded' and result in ('WIN','LOSS','PUSH','VOID')
      and (start_at at time zone 'America/Los_Angeles')::date >= ${period.start}::date
      and (start_at at time zone 'America/Los_Angeles')::date < ${period.end}::date`;
  const clv: ClvSummary = summarizeClv(clvRows.map((row) => ({ clv: row.clv == null ? null : Number(row.clv) })));
  await syncPersistentMessage(purpose,"weekly",buildWeeklyRecapPayload(period,week,await loadRecord(),clv),false);
}
