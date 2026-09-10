"use client";

import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Anchor, History, LayoutDashboard, Ticket, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/app" as const, label: "Home", icon: LayoutDashboard },
  { to: "/app/picks" as const, label: "Picks", icon: Ticket },
  { to: "/app/history" as const, label: "History", icon: History },
  { to: "/app/account" as const, label: "Account", icon: UserRound },
];

export function MemberGuard({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <div className="min-h-dvh bg-bg px-4 py-8">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="h-14 animate-pulse rounded-xl bg-surface" />
          <div className="h-48 animate-pulse rounded-xl bg-surface" />
        </div>
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return <>{children}</>;
}

export function MemberShell({ children }: { children?: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <MemberGuard>
      <div className="harbor-grid min-h-dvh bg-bg text-fg">
        <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-sm">
          <div className="mx-auto flex max-w-5xl min-w-0 items-center gap-3 px-4 py-3 sm:px-6">
            <Link to="/" className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-fg">
                <Anchor className="size-5" strokeWidth={2.2} />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-lg leading-tight tracking-wide">BOATBOYZ</span>
                <span className="text-[11px] tracking-[0.18em] text-muted uppercase">Member desk</span>
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
            <div className="hidden sm:block">
              <UserButton />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-24 sm:px-6 sm:py-10 sm:pb-10">
          {children ?? <Outlet />}
        </main>
        <nav className="fixed right-0 bottom-0 left-0 z-30 border-t border-border bg-bg/95 backdrop-blur-sm sm:hidden">
          <div className="grid grid-cols-4">
            {nav.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                    active ? "text-accent" : "text-muted",
                  )}
                >
                  <Icon className="size-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </MemberGuard>
  );
}
