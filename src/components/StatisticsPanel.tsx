import { ArrowDownToLine, ArrowUpToLine, Hash, Layers } from "lucide-react";
import type { PoleStats } from "@/types/pole";

interface StatisticsPanelProps {
  stats: PoleStats;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}

function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="surface flex items-center gap-3 rounded-lg border border-border p-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export function StatisticsPanel({ stats }: StatisticsPanelProps) {
  const pages = Object.keys(stats.perPage).length;
  return (
    <div className="space-y-2 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Estatísticas
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Total" value={stats.total} icon={<Hash className="h-4 w-4" />} />
        <StatCard label="Páginas" value={pages} icon={<Layers className="h-4 w-4" />} />
        <StatCard label="Menor" value={stats.min ?? "—"} icon={<ArrowDownToLine className="h-4 w-4" />} />
        <StatCard label="Maior" value={stats.max ?? "—"} icon={<ArrowUpToLine className="h-4 w-4" />} />
      </div>
    </div>
  );
}
