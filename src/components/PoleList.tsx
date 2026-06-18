import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import type { PdfIndex, PoleLocation } from "@/types/pole";
import { cn } from "@/lib/utils";

interface PoleListProps {
  index: PdfIndex;
  selected: PoleLocation | null;
  onSelect: (loc: PoleLocation) => void;
}

export function PoleList({ index, selected, onSelect }: PoleListProps) {
  const [filter, setFilter] = useState("");

  const sorted = useMemo(() => {
    const arr = Object.values(index);
    arr.sort((a, b) => {
      const an = parseInt(a.poleNumber, 10);
      const bn = parseInt(b.poleNumber, 10);
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
      return a.poleNumber.localeCompare(b.poleNumber);
    });
    if (!filter.trim()) return arr;
    return arr.filter((p) => p.poleNumber.includes(filter.trim()));
  }, [index, filter]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-3 pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Postes ({sorted.length})
        </h3>
      </div>
      <div className="px-3 pb-2 pt-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar lista..."
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {sorted.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            Nenhum poste indexado.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {sorted.map((p) => {
              const isSel = selected?.poleNumber === p.poleNumber;
              return (
                <li key={p.poleNumber}>
                  <button
                    onClick={() => onSelect(p)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-secondary",
                      isSel && "bg-primary/15 text-primary"
                    )}
                  >
                    <span className="flex items-center gap-2 font-medium tabular-nums">
                      <MapPin className="h-3 w-3 opacity-60" />
                      {p.poleNumber}
                    </span>
                    <span className="text-muted-foreground tabular-nums">pág. {p.page}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
