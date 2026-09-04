import type { PickStatus } from "@/lib/sports/types";

export type DiscordSend = () => Promise<{ ok: boolean; id?: string; error?: string }>;

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
  modelVersion: string;
  modelProbability: number;
  modelEdge: number;
  postedOdds: number;
  selectedOdds: number;
};

export type ClaimStore = {
  claim: (id: number) => Promise<boolean>;
  release: (id: number) => Promise<void>;
  complete: (id: number, payload: CompletePayload) => Promise<boolean>;
  status: (id: number) => Promise<PickStatus | null>;
};

export type SendOnceResult = {
  sent: boolean;
  claimed: boolean;
  status: PickStatus | null;
  error?: string;
};

export async function sendOnce(
  pickId: number,
  store: ClaimStore,
  send: DiscordSend,
  payload: Omit<CompletePayload, "discordMessageId">,
): Promise<SendOnceResult> {
  const claimed = await store.claim(pickId);
  if (!claimed) {
    return { sent: false, claimed: false, status: await store.status(pickId) };
  }
  try {
    const res = await send();
    if (!res.ok) {
      await store.release(pickId);
      return { sent: false, claimed: true, status: "queued", error: res.error };
    }
    const ok = await store.complete(pickId, {
      ...payload,
      discordMessageId: res.id ?? null,
    });
    if (!ok) {
      await store.release(pickId);
      return { sent: true, claimed: true, status: "queued", error: "Could not freeze after Discord." };
    }
    return { sent: true, claimed: true, status: "posted" };
  } catch (err) {
    await store.release(pickId);
    return {
      sent: false,
      claimed: true,
      status: "queued",
      error: err instanceof Error ? err.message : "Post failed.",
    };
  }
}

export function createMemoryLocker(
  seed: { id: number; status: PickStatus; freezeJson?: string | null }[],
): ClaimStore & { sends: number; rows: Map<number, { status: PickStatus; freezeJson: string | null; discordId: string | null }> } {
  const rows = new Map(
    seed.map((s) => [
      s.id,
      { status: s.status, freezeJson: s.freezeJson ?? null, discordId: null as string | null },
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
    sends: 0,
    claim: (id) =>
      withGate(() => {
        const row = rows.get(id);
        if (!row || row.status !== "queued" || row.freezeJson) return false;
        row.status = "posting";
        return true;
      }),
    release: (id) =>
      withGate(() => {
        const row = rows.get(id);
        if (row && row.status === "posting" && !row.freezeJson) row.status = "queued";
      }),
    complete: (id, payload) =>
      withGate(() => {
        const row = rows.get(id);
        if (!row || row.status !== "posting" || row.freezeJson) return false;
        row.status = "posted";
        row.freezeJson = payload.freezeJson;
        row.discordId = payload.discordMessageId;
        return true;
      }),
    status: async (id) => rows.get(id)?.status ?? null,
  };
}
