import { Badge } from "@/components/ui/badge";
import type { CustomerPick } from "@/lib/public/official";
import { cn, formatAmerican, formatKick, formatLine, formatUnits } from "@/lib/utils";

function resultTone(result: CustomerPick["result"]): "win" | "loss" | "push" | "muted" | "live" {
  if (result === "WIN") return "win";
  if (result === "LOSS") return "loss";
  if (result === "PUSH" || result === "VOID") return "push";
  return "live";
}

export function PickCard({ pick }: { pick: CustomerPick }) {
  const line = pick.market === "moneyline" ? "" : formatLine(pick.line);
  return (
    <article className="ticket rounded-xl px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] tracking-[0.18em] text-ticket-ink/55 uppercase">
            {pick.sport} · {pick.market}
          </p>
          <h3 className="mt-1 font-display text-xl tracking-wide text-ticket-ink">{pick.selection}</h3>
          <p className="mt-1 text-sm text-ticket-ink/70">{pick.matchup}</p>
        </div>
        <Badge tone={resultTone(pick.result)}>{pick.result ?? "LOCKED"}</Badge>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-dashed border-ticket-ink/15 pt-3 font-mono text-sm tabular-nums text-ticket-ink">
        <div>
          <p className="text-[10px] tracking-[0.16em] text-ticket-ink/50 uppercase">Price</p>
          <p>
            {line ? `${line} ` : ""}
            {formatAmerican(pick.price)}
          </p>
        </div>
        <div>
          <p className="text-[10px] tracking-[0.16em] text-ticket-ink/50 uppercase">Units</p>
          <p>{pick.units.toFixed(2)}u</p>
        </div>
        <div>
          <p className="text-[10px] tracking-[0.16em] text-ticket-ink/50 uppercase">Start</p>
          <p className="truncate">{formatKick(pick.startAt)}</p>
        </div>
      </div>
      {pick.result && pick.profitUnits != null ? (
        <p className={cn("mt-3 font-mono text-sm tabular-nums", pick.profitUnits > 0 ? "text-win" : pick.profitUnits < 0 ? "text-loss" : "text-ticket-ink/70")}>
          {formatUnits(pick.profitUnits)}
          {pick.clv != null ? ` · CLV ${(pick.clv >= 0 ? "+" : "") + (pick.clv * 100).toFixed(1)}%` : ""}
        </p>
      ) : null}
    </article>
  );
}
