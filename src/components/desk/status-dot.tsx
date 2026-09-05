import { cn } from "@/lib/utils";
import type { AutomationStatus, ServiceLevel } from "@/lib/sports/types";

export function StatusDot({ level }: { level: ServiceLevel | AutomationStatus }) {
  const tone =
    level === "ok" || level === "online"
      ? "bg-win"
      : level === "warn" || level === "delayed"
        ? "bg-push"
        : "bg-loss";
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", tone)} aria-hidden />;
}
