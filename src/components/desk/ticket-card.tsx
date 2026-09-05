import { Badge } from "@/components/ui/badge";
import { ticketCopy, ticketLabel, type TicketLabel } from "@/lib/desk/card-view";
import { vsLine } from "@/lib/sports/discord";
import { formatAmerican, formatKick, relativeTo } from "@/lib/utils";
import type { GameCard, PickRow } from "@/lib/sports/types";

function tone(label: TicketLabel): "accent" | "win" | "loss" | "push" | "muted" | "live" {
  if (label === "official" || label === "win") return "win";
  if (label === "loss") return "loss";
  if (label === "provisional" || label === "verifying" || label === "push") return "push";
  if (label === "candidate") return "accent";
  if (label === "manual") return "live";
  return "muted";
}

export function TicketCard({ pick, game, operator = false }: { pick: PickRow; game?: GameCard | null; operator?: boolean }) {
  const label = ticketLabel(pick);
  const locked = label === "official" || label === "win" || label === "loss" || label === "push" || label === "void";
  const rank = game?.rank;
  const prob = Math.round((pick.modelProbability ?? rank?.probability ?? pick.confidence / 100) * 100);
  const noVig = rank?.noVigImplied;
  const dq = rank?.dataQuality;
  return (
    <article className="rounded-xl bg-surface p-4 shadow-border">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs tracking-[0.18em] text-muted uppercase">{pick.sport}</p>
          <h3 className="mt-1 font-display text-2xl tracking-wide text-fg">{pick.selection}</h3>
          <p className="mt-0.5 text-sm text-muted">{vsLine(pick, game)}</p>
        </div>
        <Badge tone={pick.ledger === "paper" ? "push" : tone(label)}>{pick.ledger === "paper" ? "PAPER" : ticketCopy(label)}</Badge>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-sm tabular-nums">
        <div>
          <dt className="text-[10px] tracking-[0.14em] text-subtle uppercase">BoatBoyz Probability</dt>
          <dd className="text-fg">{prob}%</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-[0.14em] text-subtle uppercase">{locked ? "DraftKings at posting" : "Current scan line"}</dt>
          <dd className="text-fg">{formatAmerican(pick.postedOdds ?? pick.lockedOdds)}</dd>
        </div>
        {operator && !locked ? (
          <>
            <div>
              <dt className="text-[10px] tracking-[0.14em] text-subtle uppercase">Market no-vig</dt>
              <dd className="text-fg">{noVig != null ? `${(noVig * 100).toFixed(1)}%` : "raw"}</dd>
            </div>
            <div>
              <dt className="text-[10px] tracking-[0.14em] text-subtle uppercase">Edge</dt>
              <dd className="text-fg">
                {(rank?.edgePct ?? pick.edgePct) >= 0 ? "+" : ""}
                {(rank?.edgePct ?? pick.edgePct).toFixed(1)}%
              </dd>
            </div>
            <div>
              <dt className="text-[10px] tracking-[0.14em] text-subtle uppercase">Confidence</dt>
              <dd className="text-fg">{Math.round(rank?.confidence ?? pick.confidence)}</dd>
            </div>
            <div>
              <dt className="text-[10px] tracking-[0.14em] text-subtle uppercase">Data quality</dt>
              <dd className="text-fg">{dq == null ? "—" : `${dq}/100`}</dd>
            </div>
          </>
        ) : locked ? (
          <div>
            <dt className="text-[10px] tracking-[0.14em] text-subtle uppercase">Units</dt>
            <dd className="text-fg">{Number(pick.units).toFixed(1)}U</dd>
          </div>
        ) : (
          <div>
            <dt className="text-[10px] tracking-[0.14em] text-subtle uppercase">Model Edge</dt>
            <dd className="text-fg">
              {(pick.modelEdge ?? pick.edgePct) >= 0 ? "+" : ""}
              {(pick.modelEdge ?? pick.edgePct).toFixed(1)}%
            </dd>
          </div>
        )}
        <div>
          <dt className="text-[10px] tracking-[0.14em] text-subtle uppercase">{locked ? "Posted" : "Official check"}</dt>
          <dd className="text-muted">
            {locked
              ? pick.postedAt
                ? formatKick(pick.postedAt, "America/Los_Angeles")
                : "—"
              : relativeTo(pick.postAt)}
          </dd>
        </div>
      </dl>
      {operator && rank?.passReason ? <p className="mt-2 text-xs text-loss">{rank.passReason}</p> : null}
      {operator && rank?.missingInputs?.length && !locked ? (
        <p className="mt-1 text-xs text-subtle">Missing: {rank.missingInputs.slice(0, 4).join(", ")}</p>
      ) : null}
      <p className="mt-3 text-xs text-subtle">Game {formatKick(pick.startAt, "America/Los_Angeles")} PT</p>
      {locked ? <p className="mt-1 text-xs text-win">Official line frozen.</p> : <p className="mt-1 text-xs text-push">Not official until DraftKings verifies.</p>}
    </article>
  );
}
