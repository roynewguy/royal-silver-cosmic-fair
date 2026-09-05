"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDesk } from "@/lib/desk/use-desk";
import { canOperatorPost, operatorPostChoices } from "@/lib/sports/post-choices";
import { EMPTY_FEED_LINE } from "@/lib/sports/manual-post";
import type { GameCard } from "@/lib/sports/types";

export function GamePostPicker({ game }: { game: GameCard }) {
  const desk = useDesk();
  const [open, setOpen] = useState(false);
  if (!desk.data.operator) return null;
  if (!canOperatorPost(game)) {
    return <p className="text-xs text-subtle">{game.status} — cannot post</p>;
  }
  const choices = operatorPostChoices(game);

  return (
    <div className="min-w-0">
      <Button
        type="button"
        size="sm"
        variant={open ? "primary" : "secondary"}
        disabled={desk.posting}
        onClick={() => setOpen((v) => !v)}
      >
        {desk.posting ? <Loader2 className="size-4 animate-spin" /> : null}
        {open ? "Close" : "Post pick"}
      </Button>
      {open ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {choices.length === 0 ? (
            <p className="text-xs text-subtle">{EMPTY_FEED_LINE}</p>
          ) : (
            choices.map((choice) => (
              <Button
                key={`${choice.market}-${choice.side}`}
                type="button"
                size="sm"
                variant="ghost"
                disabled={desk.posting}
                onClick={() => {
                  if (desk.posting) return;
                  desk.manualPost({
                    gameId: game.id,
                    market: choice.market,
                    side: choice.side,
                    requestId: crypto.randomUUID(),
                  });
                }}
              >
                {choice.label}
              </Button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
