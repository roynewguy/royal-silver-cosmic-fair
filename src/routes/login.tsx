"use client";

import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Anchor } from "lucide-react";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteFooter, SiteHeader } from "@/components/site/shell";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — BoatBoyz" },
      { name: "description", content: "Sign in or create a BoatBoyz account." },
    ],
  }),
  component: Login,
});

function Login() {
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!isPending && user) return <Navigate to="/app" />;

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mode === "signup") {
        const { error: err } = await authClient.signUp.email({
          email,
          password,
          name: name.trim() || email.split("@")[0] || "Member",
          callbackURL: "/app",
        });
        if (err) throw new Error(err.message ?? "Could not create account.");
      } else {
        const { error: err } = await authClient.signIn.email({
          email,
          password,
          callbackURL: "/app",
        });
        if (err) throw new Error(err.message ?? "Could not sign in.");
      }
      window.location.href = "/app";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setPending(false);
    }
  }

  return (
    <div className="harbor-grid min-h-dvh bg-bg text-fg">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-12">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-fg">
            <Anchor className="size-5" strokeWidth={2.2} />
          </span>
          <div>
            <p className="font-display text-lg tracking-wide">BOATBOYZ</p>
            <p className="text-[11px] tracking-[0.18em] text-muted uppercase">Member access</p>
          </div>
        </div>
        <h1 className="font-display text-4xl tracking-wide">{mode === "signup" ? "Create account" : "Sign in"}</h1>
        <p className="mt-2 text-sm text-muted">Official picks stay behind a member desk. Billing via Whop comes later.</p>

        {authEnabled ? (
          <div className="mt-8 space-y-2">
            {GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="secondary"
                className="min-h-12 w-full"
                onClick={() => signIn(p.providerId, { callbackURL: "/app", errorCallbackURL: "/login" })}
              >
                Continue with {p.label}
              </Button>
            ))}
          </div>
        ) : (
          <p className="mt-8 text-sm text-muted">Sign-in is disabled.</p>
        )}

        <div className="my-8 flex items-center gap-3 text-xs tracking-[0.16em] text-subtle uppercase">
          <span className="h-px flex-1 bg-border" />
          Email
          <span className="h-px flex-1 bg-border" />
        </div>

        <form className="space-y-3" onSubmit={onEmail}>
          {mode === "signup" ? (
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              autoComplete="name"
              className="min-h-12"
            />
          ) : null}
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            required
            className="min-h-12"
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={8}
            className="min-h-12"
          />
          {error ? <p className="text-sm text-loss">{error}</p> : null}
          <Button type="submit" className="min-h-12 w-full" disabled={pending || !authEnabled}>
            {pending ? "Working…" : mode === "signup" ? "Create account" : "Sign in with email"}
          </Button>
        </form>

        <button
          type="button"
          className="mt-6 h-11 text-sm text-muted hover:text-fg"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError(null);
          }}
        >
          {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
        </button>
        <Link to="/responsible-play" className="mt-4 inline-flex h-11 items-center text-sm text-subtle hover:text-fg">
          Responsible play
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
