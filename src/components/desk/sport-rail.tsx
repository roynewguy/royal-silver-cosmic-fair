"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PickRow, SportScan } from "@/lib/sports/types";

export function SportRail({ scans, picks }: { scans: SportScan[]; picks: PickRow[] }) {
  return (
    <div className="flex w-full min-w-0 max-w-full gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible lg:flex lg:flex-col">
      {scans.map((scan) => {
        const live = picks.find(
          (p) => p.sport === scan.sport && (p.status === "queued" || p.status === "posting" || p.status === "posted") && !p.result,
        );
        return (
          <div
            key={scan.league}
            className={cn(
              "min-w-[9.5rem] rounded-lg bg-surface px-3 py-3 shadow-border sm:min-w-0",
              live ? "ring-1 ring-accent/40" : "",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-display tracking-wide text-fg">{scan.sport}</p>
              {live ? (
                <Badge tone="accent">PLAY</Badge>
              ) : scan.skipped ? (
                <Badge tone="muted">SKIP</Badge>
              ) : (
                <Badge tone="muted">{scan.gameCount}</Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-subtle">
              {live
                ? live.selection
                : scan.skipReason
                  ? scan.skipReason
                  : `${scan.gameCount} on the board`}
            </p>
          </div>
        );
      })}
    </div>
  );
}
