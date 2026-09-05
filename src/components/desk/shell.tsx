"use client";

import { Link, useRouterState } from "@tanstack/react-router";
import { Anchor, BookOpen, Home, LayoutGrid, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { DeskProvider, useDesk } from "@/lib/desk/use-desk";
import { cn, formatUnits } from "@/lib/utils";
import { StatusDot } from "@/components/desk/status-dot";

const nav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/slate", label: "Slate", icon: LayoutGrid },
  { to: "/record", label: "Record", icon: BookOpen },
  { to: "/advanced", label: "Advanced", icon: SlidersHorizontal },
] as const;

export function DeskShell({ children }: { children: ReactNode }) {
  return (
    <DeskProvider>
      <DeskShellInner>{children}</DeskShellInner>
    </DeskProvider>
  );
}

function DeskShellInner({ children }: { children: ReactNode }) {
  const { data } = useDesk();
  const record = data.record;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const recordLine = `${record.wins}-${record.losses}-${record.pushes}`;

  return (
    <div className="harbor-grid min-h-dvh overflow-x-hidden bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl min-w-0 items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex min-w-0 flex-1 items-center gap-2.5 sm:flex-none">
            <span className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-fg">
              <Anchor className="size-5" strokeWidth={2.2} />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-lg leading-tight tracking-wide text-fg">BOATBOYZ</span>
              <span className="flex items-center gap-1.5 text-xs tracking-[0.18em] text-muted uppercase">
                <StatusDot level={data.health.automation} />
                {data.health.automation === "online" ? "Online" : data.health.automation === "delayed" ? "Delayed" : data.health.automation === "offline" ? "Offline" : "Not armed"}
              </span>
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 sm:flex">
            {nav.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-150",
                    active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface hover:text-fg",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <div className="rounded-md bg-surface px-3 py-2 shadow-border">
              <p className="text-[10px] tracking-[0.16em] text-subtle uppercase">Record</p>
              <p className="font-mono text-sm tabular-nums text-fg">{recordLine}</p>
            </div>
            <div className="hidden rounded-md bg-surface px-3 py-2 shadow-border sm:block">
              <p className="text-[10px] tracking-[0.16em] text-subtle uppercase">Units</p>
              <p className={cn("font-mono text-sm tabular-nums", record.units > 0 ? "text-win" : record.units < 0 ? "text-loss" : "text-fg")}>
                {formatUnits(record.units)}
              </p>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-5 pb-24 sm:px-6 sm:py-8 sm:pb-8">{children}</main>
      <nav className="fixed right-0 bottom-0 left-0 z-30 border-t border-border bg-bg/95 backdrop-blur-sm sm:hidden">
        <div className="grid grid-cols-4">
          {nav.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-accent" : "text-muted")}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
