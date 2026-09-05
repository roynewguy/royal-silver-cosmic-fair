"use client";

import { useMemo, useState } from "react";
import { GamePostPicker } from "@/components/desk/game-post-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDesk } from "@/lib/desk/use-desk";
import { slateGameLabel, ticketCopy } from "@/lib/desk/card-view";
import { isOfficialDay, ptDayKey, addYmd, ptYmd, ymdToEspn } from "@/lib/sports/day";
import { formatAmerican, formatKick, formatLine } from "@/lib/utils";
import type { GameCard, SportId } from "@/lib/sports/types";

const SPORTS: Array<"ALL" | SportId> = ["ALL", "nfl", "ncaaf", "nba", "ncaab", "wnba", "mlb", "nhl", "ufc", "mls", "epl"];

function dayFilter(game: GameCard, day: "today" | "tomorrow" | "all"): boolean {
  if (day === "all") return true;
  const now = new Date();
  if (day === "today") return isOfficialDay(game.startAt, now) || game.status === "in_progress";
  const tmw = ymdToEspn(addYmd(ptYmd(now), 1));
  const key = ptDayKey(new Date(game.startAt)).replaceAll("-", "");
  return key === tmw;
}

export function SlateBoard() {
  const desk = useDesk();
  const [day, setDay] = useState<"today" | "tomorrow" | "all">("today");
  const [sport, setSport] = useState<(typeof SPORTS)[number]>("ALL");
  const [status, setStatus] = useState<"ALL" | "QUALIFIED" | "PASS" | "OFFICIAL">("ALL");

  const games = useMemo(() => {
    return desk.data.games
      .filter((g) => dayFilter(g, day))
      .filter((g) => (sport === "ALL" ? true : g.league === sport))
      .filter((g) => {
        const label = slateGameLabel(g, desk.data.picks);
        if (status === "QUALIFIED") return label === "candidate" || label === "provisional";
        if (status === "PASS") return label === "pass" || label === "rotated";
        if (status === "OFFICIAL") return label === "official" || label === "verifying" || label === "win" || label === "loss";
        return true;
      })
      .sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
  }, [desk.data.games, desk.data.picks, day, sport, status]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs tracking-[0.22em] text-accent uppercase">Board</p>
        <h1 className="mt-1 font-display text-4xl tracking-wide">Slate</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Every sport on the board. Unlock to post any game — moneyline, spread, or total — even if BoatBoyz PASSed it.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["today", "tomorrow", "all"] as const).map((d) => (
          <Button key={d} size="sm" variant={day === d ? "primary" : "secondary"} onClick={() => setDay(d)}>
            {d === "today" ? "Today" : d === "tomorrow" ? "Tomorrow" : "All games"}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {SPORTS.map((s) => (
          <Button key={s} size="sm" variant={sport === s ? "primary" : "ghost"} onClick={() => setSport(s)}>
            {s === "ALL" ? "All" : s.toUpperCase()}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {(["ALL", "QUALIFIED", "PASS", "OFFICIAL"] as const).map((s) => (
          <Button key={s} size="sm" variant={status === s ? "secondary" : "ghost"} onClick={() => setStatus(s)}>
            {s === "ALL" ? "All status" : s}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 md:hidden">
        {games.map((g) => (
          <GameMobile key={g.id} game={g} />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl bg-surface shadow-border md:block">
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] tracking-[0.14em] text-subtle uppercase">
            <tr className="border-b border-border">
              <th className="px-4 py-3 font-medium">Matchup</th>
              <th className="px-3 py-3 font-medium">Kick PT</th>
              <th className="px-3 py-3 font-medium">ML</th>
              <th className="px-3 py-3 font-medium">BoatBoyz</th>
              <th className="px-3 py-3 font-medium">Edge</th>
              {desk.data.operator ? <th className="px-3 py-3 font-medium">DQ</th> : null}
              <th className="px-3 py-3 font-medium">Status</th>
              {desk.data.operator ? <th className="px-3 py-3 font-medium">Post</th> : null}
            </tr>
          </thead>
          <tbody>
            {games.map((g) => {
              const label = slateGameLabel(g, desk.data.picks);
              return (
                <tr key={g.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="text-xs text-subtle">{g.sport}</p>
                    <p className="text-fg">
                      {g.away.abbr} @ {g.home.abbr}
                    </p>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-muted">{formatKick(g.startAt, "America/Los_Angeles")}</td>
                  <td className="px-3 py-3 font-mono text-xs">
                    {g.away.abbr} {formatAmerican(g.odds.awayMl)} · {g.home.abbr} {formatAmerican(g.odds.homeMl)}
                  </td>
                  <td className="px-3 py-3 text-sm">{g.rank?.selection ?? "—"}</td>
                  <td className="px-3 py-3 font-mono text-xs">
                    {g.rank ? `${g.rank.edgePct >= 0 ? "+" : ""}${g.rank.edgePct.toFixed(1)}%` : "—"}
                  </td>
                  {desk.data.operator ? (
                    <td className="px-3 py-3 font-mono text-xs text-muted">
                      {g.rank?.dataQuality == null ? "—" : `${g.rank.dataQuality}${g.rank.passReason ? ` · ${g.rank.passReason}` : ""}`}
                    </td>
                  ) : null}
                  <td className="px-3 py-3">
                    <Badge tone={label === "official" ? "win" : label === "candidate" || label === "provisional" ? "accent" : "muted"}>
                      {ticketCopy(label)}
                    </Badge>
                  </td>
                  {desk.data.operator ? (
                    <td className="px-3 py-3">
                      <GamePostPicker game={g} />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {games.length === 0 ? <p className="text-sm text-muted">No games in this filter.</p> : null}
    </div>
  );
}

function GameMobile({ game }: { game: GameCard }) {
  const desk = useDesk();
  const label = slateGameLabel(game, desk.data.picks);
  return (
    <article className="rounded-xl bg-surface p-4 shadow-border">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs tracking-[0.16em] text-subtle uppercase">{game.sport}</p>
          <p className="mt-1 font-display text-xl tracking-wide">
            {game.away.abbr} @ {game.home.abbr}
          </p>
          <p className="text-xs text-muted">{formatKick(game.startAt, "America/Los_Angeles")} PT</p>
        </div>
        <Badge tone={label === "official" ? "win" : label === "candidate" || label === "provisional" ? "accent" : "muted"}>
          {ticketCopy(label)}
        </Badge>
      </div>
      <p className="mt-3 font-mono text-xs text-muted">
        ML {game.away.abbr} {formatAmerican(game.odds.awayMl)} · {game.home.abbr} {formatAmerican(game.odds.homeMl)}
        {game.odds.homeSpread != null ? ` · spread ${game.home.abbr} ${formatLine(game.odds.homeSpread)}` : ""}
      </p>
      {game.rank ? (
        <p className="mt-2 text-sm text-fg">
          {game.rank.selection} · {Math.round(game.rank.probability * 100)}% · {game.rank.edgePct >= 0 ? "+" : ""}
          {game.rank.edgePct.toFixed(1)}% edge
        </p>
      ) : (
        <p className="mt-2 text-sm text-subtle">No qualifying play</p>
      )}
      {desk.data.operator && game.rank ? (
        <p className="mt-1 text-xs text-subtle">
          DQ {game.rank.dataQuality ?? "—"}/100 · conf {game.rank.confidence}
          {game.rank.noVigImplied != null ? ` · no-vig ${(game.rank.noVigImplied * 100).toFixed(1)}%` : ""}
          {game.rank.passReason ? ` · ${game.rank.passReason}` : ""}
        </p>
      ) : null}
      {desk.data.operator ? (
        <div className="mt-3">
          <GamePostPicker game={game} />
        </div>
      ) : null}
    </article>
  );
}
