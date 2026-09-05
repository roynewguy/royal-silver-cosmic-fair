import { getSql } from "../db";
import { channelWebhook } from "../sports/discord-routing";
import { postWebhook } from "../sports/discord";
import { recordEvent } from "./telemetry";
import { alertOwner } from "./alerts";

export async function flushResultRecaps(): Promise<void> {
  const sql = await getSql();
  const hook = channelWebhook("results");
  if (!hook) return;
  const stale = await sql<{id:number}>`update picks set result_delivery = 'delivery_unknown'
    where result_delivery = 'sending' and result_attempted_at < now() - interval '4 minutes' returning id`;
  if (stale.length) await alertOwner("DISCORD_FAIL", "Result delivery uncertain; review result feed before any resend.");
  const rows = await sql<{id: number; result_message: string}>`select id, result_message from picks
    where result_delivery = 'queued' and ledger = 'official' and result_message is not null order by id limit 20`;
  for (const row of rows) {
    const claim = await sql<{id:number}>`update picks set result_delivery = 'sending', result_attempted_at = now()
      where id = ${row.id} and result_delivery = 'queued' returning id`;
    if (!claim.length) continue;
    try {
      const sent = await postWebhook(hook, row.result_message);
      if (!sent.ok) {
        await sql`update picks set result_delivery = ${sent.uncertain ? 'delivery_unknown' : 'queued'} where id = ${row.id} and result_delivery = 'sending'`;
        await recordEvent(sent.uncertain ? "delivery_unknown" : "discord_failure", "Results delivery failed");
        await alertOwner("DISCORD_FAIL", "Result recap failed; inspect delivery status.");
        continue;
      }
      await sql`update picks set result_delivery = 'sent', result_message_id = ${sent.id} where id = ${row.id} and result_delivery = 'sending'`;
      await recordEvent("discord_results_success");
    } catch {
      // The sending state is a durable fence if acknowledgement storage failed.
      await alertOwner("DISCORD_FAIL", "Result confirmation could not be stored; do not resend.");
    }
  }
}
