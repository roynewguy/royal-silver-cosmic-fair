"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDesk } from "@/lib/desk/use-desk";
import { buildDiscordPresets } from "@/lib/sports/discord-presets";

export function DiscordComposer({ compact = false }: { compact?: boolean }) {
  const desk = useDesk();
  const [text, setText] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const presets = useMemo(
    () =>
      buildDiscordPresets({
        record: desk.data.record,
        picks: desk.data.picks,
        games: desk.data.games,
      }),
    [desk.data.record, desk.data.picks, desk.data.games],
  );
  if (!desk.data.operator) return null;
  const shown = compact ? presets.filter((p) => ["card", "pass", "record", "cash", "live", "note"].includes(p.id)) : presets;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        desk.sendNote(text, () => {
          setText("");
          setActive(null);
        });
      }}
    >
      {!compact ? (
        <p className="text-xs text-subtle">Tap a preset, edit it, then send. Never added to the official record.</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {shown.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            size="sm"
            variant={active === preset.id ? "primary" : "secondary"}
            onClick={() => {
              setText(preset.body);
              setActive(preset.id);
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(null);
        }}
        rows={compact ? 5 : 8}
        maxLength={1900}
        placeholder="Write a desk note — recap, lineup, injury. Not an official pick."
        className="w-full resize-y rounded-xl bg-bg-elevated px-3 py-2.5 text-sm text-fg outline-none ring-1 ring-white/10 focus:ring-accent"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] text-subtle">{text.trim().length}/1900</p>
        <Button type="submit" disabled={desk.sendingNote || !text.trim()}>
          {desk.sendingNote ? <Loader2 className="size-4 animate-spin" /> : null}
          Send to Discord
        </Button>
      </div>
    </form>
  );
}
