import { isDraftKingsLine } from "./odds-api.ts";
import { priceFor, lineFor } from "./odds.ts";
import type { OddsSnapshot, PickRow } from "./types.ts";

/** CLV is price-to-price on the SAME market/line, using the last verified pregame quote. */
export function verifiedClosingPrice(raw: string | null, pick: Pick<PickRow, "startAt" | "market" | "side" | "lockedLine">): number | null {
  if (!raw) return null;
  try {
    const snap = JSON.parse(raw) as OddsSnapshot;
    const time = Date.parse(snap.capturedAt ?? "");
    const start = Date.parse(pick.startAt);
    if (!isDraftKingsLine(snap) || !Number.isFinite(time) || !Number.isFinite(start) || time >= start || start - time > 20 * 60_000) return null;
    if (lineFor(snap, pick.market, pick.side) !== pick.lockedLine) return null;
    return priceFor(snap, pick.market, pick.side);
  } catch { return null; }
}
