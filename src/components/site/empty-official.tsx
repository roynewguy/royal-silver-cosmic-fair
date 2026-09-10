import { EMPTY_OFFICIAL_COPY, EMPTY_OFFICIAL_DETAIL } from "@/lib/public/official";

export function EmptyOfficial({ className }: { className?: string }) {
  return (
    <div className={className ?? "rounded-xl bg-surface px-5 py-10 text-center shadow-border"}>
      <p className="font-display text-2xl tracking-wide text-fg">{EMPTY_OFFICIAL_COPY}</p>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted">{EMPTY_OFFICIAL_DETAIL}</p>
    </div>
  );
}
