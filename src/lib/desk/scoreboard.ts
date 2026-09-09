import { getSql } from "../db";
import { loadRecord } from "./store";
import { channelWebhook, webhookIdentity, type DiscordRole } from "../sports/discord-routing";
import { buildRecordScoreboard, postWebhook, editWebhookMessage, serializeResultWebhookBody, type DiscordWebhookPayload } from "../sports/discord";
import { summarizeClv } from "../sports/closing";
import { alertOwner } from "./alerts";
import { recordEvent } from "./telemetry";

/** Called under the production worker lease. Durable first-send fence prevents duplicates. */
export async function syncRecordScoreboard(): Promise<void> {
  const sql = await getSql();
  const clvRows = await sql<{ clv: number | null }>`
    select clv from picks
    where ledger='official' and coalesce(pick_source,'auto')='auto' and official_key is not null and posted_at is not null
      and status='graded' and result in ('WIN','LOSS','PUSH','VOID')`;
  const clv = summarizeClv(clvRows.map((row) => ({ clv: row.clv == null ? null : Number(row.clv) })));
  await syncPersistentMessage("record", "record", buildRecordScoreboard(await loadRecord(), clv));
}

export async function syncPersistentMessage(
  purpose: string,
  role: DiscordRole,
  body: string | DiscordWebhookPayload,
  updateExisting = true,
): Promise<void> {
  const hook = channelWebhook(role);
  if (!hook) return;
  const sql = await getSql();

  const identity = webhookIdentity(hook)!;
  const content = typeof body === "string" ? body : serializeResultWebhookBody(body);
  type Row = { webhook_id: string; message_id: string | null; state: string; content: string };
  const claim = await sql<Row>`insert into discord_scoreboard(purpose,webhook_id,state,content)
    values (${purpose},${identity},'sending',${content}) on conflict do nothing returning *`;
  if (claim.length) {
    // Any crash after this claim leaves a fence; never automatically repeat the POST.
    const sent = await postWebhook(hook, body);
    if (!sent.ok || !sent.id) {
      await sql`update discord_scoreboard set state='delivery_unknown' where purpose=${purpose}`;
      await alertOwner("DISCORD_FAIL", "Scoreboard creation failed or is uncertain; inspect the results scoreboard before retrying.");
      return;
    }
    await sql`update discord_scoreboard set state='sent', message_id=${sent.id}, updated_at=now() where purpose=${purpose}`;
    await recordEvent(`discord_${role}_success`);
    return;
  }
  const [row] = await sql<Row>`select * from discord_scoreboard where purpose=${purpose}`;
  if (!row || row.state !== "sent" || row.webhook_id !== identity || !row.message_id) {
    await alertOwner("DISCORD_FAIL", "Scoreboard needs review: creation uncertain, message missing, or webhook changed. No duplicate created.");
    return;
  }
  if (!updateExisting || row.content === content) return;
  const edited = await editWebhookMessage(hook, row.message_id, body);
  if (!edited.ok) {
    if (edited.missing) await sql`update discord_scoreboard set state='missing' where purpose=${purpose}`;
    await alertOwner("DISCORD_FAIL", "Public scoreboard update failed; retained original message identity.");
    return;
  }
  await sql`update discord_scoreboard set content=${content}, updated_at=now() where purpose=${purpose}`;
  await recordEvent(`discord_${role}_success`);
}
