import { randomBytes } from "node:crypto";
import type { PickStatus } from "@/lib/sports/types";

export const STALE_POSTING_MS = 4 * 60 * 1000;

export type DiscordSend = () => Promise<{ ok: boolean; id?: string; error?: string; uncertain?: boolean }>;

export type CompletePayload = {
  freezeJson: string;
  discordMessage: string;
  discordMessageId: string | null;
  selection: string;
  market: string;
  side: string;
  lockedOdds: number;
  lockedLine: number | null;
  lockedOddsJson: string;
  edgePct: number;
  confidence: number;
  units: number;
  modelVersion: string | null;
  modelProbability: number | null;
  modelEdge: number | null;
  postedOdds: number;
  selectedOdds: number;
};

export type ClaimStore = {
  claim: (id: number) => Promise<string | null>;
  prepare: (id: number, token: string, payload: Omit<CompletePayload, "discordMessageId">) => Promise<boolean>;
  unknown: (id: number, token: string) => Promise<void>;
  release: (id: number, token: string) => Promise<void>;
  complete: (id: number, token: string, payload: CompletePayload) => Promise<boolean>;
  status: (id: number) => Promise<PickStatus | null>;
};

export type SendOnceResult = {
  sent: boolean;
  claimed: boolean;
  status: PickStatus | null;
  error?: string;
  uncertain?: boolean;
};

export function newPostingToken(): string {
  return randomBytes(16).toString("hex");
}

export function shouldRecoverStuckPost(input: {
  status: string;
  postingStartedAt: string | null | undefined;
  now?: number;
  maxAgeMs?: number;
}): boolean {
  if (input.status !== "posting") return false;
  if (!input.postingStartedAt) return false;
  const started = new Date(input.postingStartedAt).getTime();
  if (!Number.isFinite(started)) return false;
  const now = input.now ?? Date.now();
  return now - started >= (input.maxAgeMs ?? STALE_POSTING_MS);
}

export async function sendOnce(
  pickId: number,
  store: ClaimStore,
  send: DiscordSend,
  payload: Omit<CompletePayload, "discordMessageId">,
): Promise<SendOnceResult> {
  const token = await store.claim(pickId);
  if (!token) {
    return { sent: false, claimed: false, status: await store.status(pickId) };
  }
  try {
    if (!await store.prepare(pickId, token, payload)) throw new Error("Ticket could not be frozen before send");
    const res = await send();
    if (res.uncertain) throw new Error(res.error ?? "DELIVERY_UNKNOWN");
    if (!res.ok) {
      await store.release(pickId, token);
      return { sent: false, claimed: true, status: "queued", error: res.error };
    }
    const ok = await store.complete(pickId, token, {
      ...payload,
      discordMessageId: res.id ?? null,
    });
    if (!ok) {
      await store.unknown(pickId, token);
      return {
        sent: true,
        claimed: true,
        uncertain: true,
        status: await store.status(pickId),
        error: "Discord acknowledgement could not be stored; do not resend.",
      };
    }
    return { sent: true, claimed: true, status: "posted" };
  } catch (err) {
    try { await store.unknown(pickId, token); } catch { /* durable posting claim still prevents resend */ }
    return {
      sent: false,
      claimed: true,
      uncertain: true,
      status: "delivery_unknown",
      error: err instanceof Error ? err.message : "Discord send timed out.",
    };
  }
}

type MemoryRow = {
  status: PickStatus;
  freezeJson: string | null;
  discordId: string | null;
  token: string | null;
  postingStartedAt: number | null;
  createdAt: number;
};

export function createMemoryLocker(
  seed: { id: number; status: PickStatus; freezeJson?: string | null; createdAt?: number; postingStartedAt?: number | null }[],
): ClaimStore & { rows: Map<number, MemoryRow>; recoverStale: (now?: number) => number } {
  const rows = new Map<number, MemoryRow>(
    seed.map((s) => [
      s.id,
      {
        status: s.status,
        freezeJson: s.freezeJson ?? null,
        discordId: null,
        token: s.status === "posting" ? "seed" : null,
        postingStartedAt: s.postingStartedAt ?? (s.status === "posting" ? Date.now() : null),
        createdAt: s.createdAt ?? Date.now(),
      },
    ]),
  );
  let gate = Promise.resolve();
  const withGate = <T>(fn: () => T) => {
    const next = gate.then(() => fn());
    gate = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
  return {
    rows,
    recoverStale: (now = Date.now()) => {
      let n = 0;
      for (const row of rows.values()) {
        if (
          shouldRecoverStuckPost({
            status: row.status,
            postingStartedAt: row.postingStartedAt ? new Date(row.postingStartedAt).toISOString() : null,
            now,
          })
        ) {
          if (row.discordId) {
            row.status = "posted";
          } else {
            row.status = "delivery_unknown";
          }
          row.token = null;
          row.postingStartedAt = null;
          n += 1;
        }
      }
      return n;
    },
    claim: (id) =>
      withGate(() => {
        const row = rows.get(id);
        if (!row || row.status !== "queued" || row.freezeJson) return null;
        row.status = "posting";
        row.token = newPostingToken();
        row.postingStartedAt = Date.now();
        return row.token;
      }),
    prepare: (id, token, payload) => withGate(() => {
      const row = rows.get(id);
      if (!row || row.status !== "posting" || row.token !== token) return false;
      row.freezeJson = payload.freezeJson;
      return true;
    }),
    unknown: (id, token) => withGate(() => {
      const row = rows.get(id);
      if (row?.status === "posting" && row.token === token) row.status = "delivery_unknown";
    }),
    release: (id, token) =>
      withGate(() => {
        const row = rows.get(id);
        if (row && row.status === "posting" && row.token === token) {
          row.status = "queued";
          row.freezeJson = null;
          row.token = null;
          row.postingStartedAt = null;
        }
      }),
    complete: (id, token, payload) =>
      withGate(() => {
        const row = rows.get(id);
        if (!row || row.status !== "posting" || row.token !== token) return false;
        row.status = "posted";
        row.freezeJson = payload.freezeJson;
        row.discordId = payload.discordMessageId;
        row.token = null;
        row.postingStartedAt = null;
        return true;
      }),
    status: async (id) => rows.get(id)?.status ?? null,
  };
}
