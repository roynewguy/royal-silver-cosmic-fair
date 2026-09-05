export const PAPER_LEDGER = "paper";
export const OFFICIAL_LEDGER = "official";

export function isPaperMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.PAPER_MODE?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

export function activeLedger(env: NodeJS.ProcessEnv = process.env): "paper" | "official" {
  return isPaperMode(env) ? PAPER_LEDGER : OFFICIAL_LEDGER;
}

export function isPaperLedger(ledger: string | null | undefined): boolean {
  return ledger === PAPER_LEDGER;
}

export function paperLockMessage(selection: string): string {
  return `🧪 PAPER TICKET — NOT A CUSTOMER PICK\n${selection}\nThis is a simulated official lock. It is not on the public BoatBoyz record.`;
}

export async function paperSimulateSend(): Promise<{ ok: true; id: string }> {
  return { ok: true, id: `paper-${Date.now()}` };
}
