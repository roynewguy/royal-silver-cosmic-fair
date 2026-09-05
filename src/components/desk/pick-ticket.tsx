"use client";

import { Clock3, Copy, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatAmerican, formatKick, formatLine, relativeTo } from "@/lib/utils";
import type { PickRow } from "@/lib/sports/types";

function resultTone(result: PickRow["result"]): "win" | "loss" | "push" | "muted" | "accent" {
  if (result === "WIN") return "win";
  if (result === "LOSS") return "loss";
  if (result === "PUSH" || result === "VOID") return "push";
  return "muted";
}

export function PickTicket({
  pick,
  onPost,
  onPostLive,
  onDelete,
  posting,
}: {
  pick: PickRow;
  onPost?: () => void;
  onPostLive?: () => void;
  onDelete?: () => void;
  posting?: boolean;
}) {
  const statusLabel =
    pick.result ??
    (pick.status === "posted" ? "POSTED" : pick.status === "queued" ? "QUEUED" : pick.status.toUpperCase());

  async function copy() {
    const text = pick.discordMessage ?? `${pick.sport} · ${pick.selection}\n${pick.reason}`;
    await navigator.clipboard.writeText(text);
    toast.success("Copied pick copy.");
  }

  return (
    <article className="overflow-hidden rounded-xl bg-surface p-2 shadow-border">
      <div className="ticket rounded-lg px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-xs tracking-[0.22em] text-ticket-ink/60 uppercase">
              {pick.sport} · {pick.market}
            </p>
            <h3 className="mt-1 font-display text-2xl leading-none tracking-wide text-ticket-ink">
              {pick.selection}
            </h3>
            <p className="mt-1 text-sm text-ticket-ink/70">{pick.matchup}</p>
          </div>
          <Badge tone={resultTone(pick.result)} className="shrink-0">
            {statusLabel}
          </Badge>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs tabular-nums text-ticket-ink/70">
          <span>Kick {formatKick(pick.startAt)}</span>
          <span>Post {relativeTo(pick.postAt)}</span>
          <span>{pick.units}u</span>
          <span>BoatBoyz {Math.round(pick.modelProbability != null ? pick.modelProbability * 100 : pick.confidence)}%</span>
          <span>{formatAmerican(pick.lockedOdds)}</span>
        </div>
      </div>
      <div className="px-3 pt-3 pb-2">
        <p className="text-sm leading-relaxed text-muted">{pick.reason}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-subtle">
          <Clock3 className="size-3.5" />
          <span>
            Locked {pick.market === "total" ? String(pick.lockedLine ?? "—") : formatLine(pick.lockedLine)}{" "}
            {formatAmerican(pick.lockedOdds)} · {pick.lockedOddsJson.book}
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="sm" onClick={copy} className="min-h-11 flex-1 sm:flex-none">
            <Copy className="size-4" />
            Copy
          </Button>
          {onPost && pick.status !== "graded" ? (
            <Button
              variant="primary"
              size="sm"
              onClick={onPost}
              disabled={posting}
              className={cn("min-h-11 flex-1 sm:flex-none")}
            >
              <Send className="size-4" />
              {pick.status === "posted" ? "Send webhook" : "Post now"}
            </Button>
          ) : null}
          {onPostLive && pick.gameStatus === "in_progress" && pick.status !== "graded" ? (
            <Button variant="primary" size="sm" onClick={onPostLive} disabled={posting} className="min-h-11 flex-1 sm:flex-none">
              Post live
            </Button>
          ) : null}
          {onDelete && pick.status === "posted" && pick.discordMessageId ? (
            <Button variant="ghost" size="sm" onClick={onDelete} disabled={posting} className="min-h-11 flex-1 sm:flex-none">
              Delete Discord post
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
