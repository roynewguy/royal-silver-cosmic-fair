"use client";

import { Link } from "@tanstack/react-router";
import { Anchor } from "lucide-react";
import type { ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const publicLinks = [
  { to: "/record" as const, label: "Record" },
  { to: "/pricing" as const, label: "Pricing" },
  { to: "/responsible-play" as const, label: "Responsible play" },
];

function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="h-11 w-28 animate-pulse rounded-md bg-surface-2" aria-hidden />;
  }
  if (user) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <Button asChild variant="secondary" size="sm" className="min-h-11">
          <Link to="/app">Dashboard</Link>
        </Button>
        <div className="hidden min-w-0 sm:block">
          <UserButton />
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Link
        to="/login"
        className="hidden h-11 items-center px-3 text-sm font-medium text-muted transition-colors duration-150 hover:text-fg sm:inline-flex"
      >
        Sign in
      </Link>
      <Button asChild className="min-h-11">
        <Link to="/login">Get access</Link>
      </Button>
    </div>
  );
}

export function SiteHeader({ dark = true }: { dark?: boolean }) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-border/80 backdrop-blur-sm",
        dark ? "bg-bg/90" : "bg-bg/90",
      )}
    >
      <div className="mx-auto flex max-w-6xl min-w-0 items-center gap-3 px-4 py-3 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-fg">
            <Anchor className="size-5" strokeWidth={2.2} />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg leading-tight tracking-wide text-fg">BOATBOYZ</span>
            <span className="hidden text-[11px] tracking-[0.18em] text-muted uppercase sm:block">Official locks</span>
          </span>
        </Link>
        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {publicLinks.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface hover:text-fg"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto md:ml-2">
          <AuthSlot />
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-border px-4 py-1 md:hidden">
        {publicLinks.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="inline-flex h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium text-muted hover:text-fg"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-bg-elevated">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-display text-xl tracking-wide text-fg">BOATBOYZ</p>
            <p className="mt-2 max-w-sm text-sm text-muted">
              Official production locks only. Losses stay on the public record. This is entertainment, not a guarantee.
            </p>
          </div>
          <p className="font-mono text-sm tabular-nums text-accent">$9.99 / month</p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
          <Link to="/record" className="h-11 inline-flex items-center hover:text-fg">
            Record
          </Link>
          <Link to="/pricing" className="h-11 inline-flex items-center hover:text-fg">
            Pricing
          </Link>
          <Link to="/responsible-play" className="h-11 inline-flex items-center hover:text-fg">
            Responsible play
          </Link>
          <Link to="/terms" className="h-11 inline-flex items-center hover:text-fg">
            Terms
          </Link>
          <Link to="/privacy" className="h-11 inline-flex items-center hover:text-fg">
            Privacy
          </Link>
          <Link to="/desk" className="h-11 inline-flex items-center hover:text-fg">
            Operator
          </Link>
        </div>
        <p className="text-xs text-subtle">
          Must be 21+ where legal. If you or someone you know has a gambling problem, call 1-800-GAMBLER.
        </p>
      </div>
    </footer>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="harbor-grid min-h-dvh bg-bg text-fg">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
      <SiteFooter />
    </div>
  );
}
