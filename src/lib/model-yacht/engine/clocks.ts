import { createHash } from "node:crypto";
import { YACHT_OBS_SCHEMA } from "./types.ts";

/** Source timestamp only. Never fallback to now, predictionAt, or another feed. */
export function sourceClock(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? value : null;
}

export function checksumOf(payload: unknown): string {
  return createHash("sha256").update(stableJson(payload)).digest("hex").slice(0, 32);
}

export function stableJson(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(",")}}`;
}

export function yachtId(prefix: string, parts: Array<string | number | null | undefined>): string {
  const h = createHash("sha256");
  for (const p of parts) {
    h.update(String(p ?? ""));
    h.update("\0");
  }
  return `${prefix}_${h.digest("hex").slice(0, 24)}`;
}

/**
 * Proven if the source clock exists, parses, and is not after collection
 * (and not after start when the caller supplies startAt for pregame features).
 */
export function sourceProvenanceOk(input: {
  knownAt: string | null;
  collectedAt: string;
  startAt?: string | null;
}): boolean {
  if (!input.knownAt) return false;
  const known = Date.parse(input.knownAt);
  const collected = Date.parse(input.collectedAt);
  if (!Number.isFinite(known) || !Number.isFinite(collected)) return false;
  if (known > collected) return false;
  if (input.startAt) {
    const start = Date.parse(input.startAt);
    if (Number.isFinite(start) && known > start) return false;
  }
  return true;
}

export function schemaVersion(): string {
  return YACHT_OBS_SCHEMA;
}
