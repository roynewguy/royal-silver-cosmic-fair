"use client";

import { Link } from "@tanstack/react-router";
import { Anchor } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDesk } from "@/lib/desk/use-desk";

export function OperatorUnlock() {
  const desk = useDesk();
  const [pin, setPin] = useState("");

  return (
    <div className="harbor-grid flex min-h-dvh flex-col bg-bg text-fg">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <Link to="/" className="mb-8 flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-fg">
            <Anchor className="size-5" strokeWidth={2.2} />
          </span>
          <span>
            <span className="block font-display text-lg tracking-wide">BOATBOYZ</span>
            <span className="text-[11px] tracking-[0.18em] text-muted uppercase">Operator desk</span>
          </span>
        </Link>
        <h1 className="font-display text-4xl tracking-wide">Unlock the desk</h1>
        <p className="mt-2 text-sm text-muted">
          Operator tools stay off the public site. Enter the desk secret to continue.
        </p>
        <form
          className="mt-8 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            desk.unlock(pin);
          }}
        >
          <Input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Operator secret"
            className="min-h-12"
            autoComplete="current-password"
            minLength={8}
          />
          <Button type="submit" className="min-h-12 w-full">
            Unlock
          </Button>
        </form>
        <Link to="/" className="mt-6 inline-flex h-11 items-center text-sm text-muted hover:text-fg">
          Back to BoatBoyz
        </Link>
      </div>
    </div>
  );
}
