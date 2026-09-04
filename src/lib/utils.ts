import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAmerican(odds: number | null | undefined): string {
  if (odds == null || !Number.isFinite(odds)) return "—";
  if (odds > 0) return `+${Math.round(odds)}`;
  return String(Math.round(odds));
}

export function formatLine(line: number | null | undefined): string {
  if (line == null || !Number.isFinite(line)) return "";
  if (line > 0) return `+${line}`;
  return String(line);
}

export function formatUnits(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0.00u";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}u`;
}

export function formatKick(iso: string, timeZone = "America/New_York"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function formatClock(iso: string, timeZone = "America/New_York"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function relativeTo(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = t - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  if (mins < 1) return diff >= 0 ? "now" : "just now";
  if (mins < 60) return diff >= 0 ? `in ${mins}m` : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return diff >= 0 ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return diff >= 0 ? `in ${days}d` : `${days}d ago`;
}

export function profitFromOdds(american: number, units: number, result: "WIN" | "LOSS" | "PUSH"): number {
  if (result === "PUSH") return 0;
  if (result === "LOSS") return -units;
  if (american < 0) return (100 / Math.abs(american)) * units;
  return (american / 100) * units;
}
