import { getSql } from "../db";

/** Durable facts, not browser-derived counters. No payloads or credentials in events. */
export async function recordEvent(kind: string, detail = ""): Promise<void> {
  const sql = await getSql();
  const safe = detail.replace(/https?:\/\/\S+/g, "[url]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 500);
  await sql`insert into operational_events(kind, detail) values (${kind}, ${safe})`;
}
