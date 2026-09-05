"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDesk } from "@/lib/desk/use-desk";

export function DiscordComposer({ compact = false }: { compact?: boolean }) {
  const desk = useDesk();
  const [text, setText] = useState("");
  if (!desk.data.operator) return null;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        desk.sendNote(text, () => setText(""));
      }}
    >
      {!compact ? (
        <p className="text-xs text-subtle">Whatever you type here is what the bot posts. Not added to the official record.</p>
      ) : null}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={compact ? 4 : 6}
        maxLength={1900}
        placeholder="Write anything — recap, custom pick, lineup note…"
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
