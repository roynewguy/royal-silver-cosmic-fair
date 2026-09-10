import type { PublicRecord } from "@/lib/public/official";
import { cn, formatUnits } from "@/lib/utils";

function Stat({ label, value, hot }: { label: string; value: string; hot?: number | null }) {
  return (
    <div className="rounded-xl bg-surface px-4 py-4 shadow-border">
      <p className="text-[11px] tracking-[0.16em] text-subtle uppercase">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-xl tabular-nums",
          hot == null ? "text-fg" : hot > 0 ? "text-win" : hot < 0 ? "text-loss" : "text-fg",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function RecordStats({ record }: { record: PublicRecord }) {
  const wl = `${record.wins}-${record.losses}-${record.pushes}`;
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <Stat label="Official W-L-P" value={wl} />
      <Stat label="Units" value={formatUnits(record.units)} hot={record.units} />
      <Stat label="ROI" value={record.roi == null ? "—" : `${(record.roi * 100).toFixed(1)}%`} hot={record.roi} />
      <Stat
        label="Avg CLV"
        value={record.avgClv == null ? "—" : `${record.avgClv >= 0 ? "+" : ""}${(record.avgClv * 100).toFixed(1)}%`}
        hot={record.avgClv}
      />
    </div>
  );
}
