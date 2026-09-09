import { getSql } from "../db";
import { loadRecord } from "./store";
import { channelWebhook, webhookIdentity, type DiscordRole } from "../sports/discord-routing";
import { buildRecordScoreboard, postWebhook, editWebhookMessage } from "../sports/discord";
import { alertOwner } from "./alerts";
import { recordEvent } from "./telemetry";

/** Called under the production worker lease. Durable first-send fence prevents duplicates. */
export async function syncRecordScoreboard(): Promise<void> {
  await syncPersistentMessage("record", "record", buildRecordScoreboard(await loadRecord()));
}

export async function syncPersistentMessage(purpose: string, role: DiscordRole, content: string, updateExisting = true): Promise<void> {
  const hook = channelWebhook(role);
  if (!hook) return;
  const sql = await getSql();

  const identity = webhookIdentity(hook)!;
  type Row = { webhook_id: string; message_id: string | null; state: string; content: string };
  const claim = await sql<Row>`insert into discord_scoreboard(purpose,webhook_id,state,content)
    values (${purpose},${identity},'sending',${content}) on conflict do nothing returning *`;
  if (claim.length) {
    // Any crash after this claim leaves a fence; never automatically repeat the POST.
    const sent = await postWebhook(hook, content);
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
  const edited = await editWebhookMessage(hook, row.message_id, content);
  if (!edited.ok) {
    if (edited.missing) await sql`update discord_scoreboard set state='missing' where purpose=${purpose}`;
    await alertOwner("DISCORD_FAIL", "Public scoreboard update failed; retained original message identity.");
    return;
  }
  await sql`update discord_scoreboard set content=${content}, updated_at=now() where purpose=${purpose}`;
  await recordEvent(`discord_${role}_success`);
}
