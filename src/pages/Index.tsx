import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MapPin, Trash2 } from "lucide-react";
import { Header } from "@/components/Header";
import { UploadArea } from "@/components/UploadArea";
import { SearchBar } from "@/components/SearchBar";
import { PdfViewer } from "@/components/PdfViewer";
import { PoleList } from "@/components/PoleList";
import { StatisticsPanel } from "@/components/StatisticsPanel";
import { findPole, usePdfIndex } from "@/hooks/usePdfIndex";
import type { PoleLocation } from "@/types/pole";

const Index = () => {
  const { pdf, index, loading, indexing, progress, error, fileName, stats, hasStored, loadPdf, clearSaved } = usePdfIndex();
  const [highlight, setHighlight] = useState<PoleLocation | null>(null);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    if (!indexing && stats.total > 0) {
      toast.success(`${stats.total} postes indexados`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexing]);

  const handleSearch = useCallback((q: string) => {
    if (!pdf) {
      toast.error("Carregue um PDF primeiro");
      return;
    }
    const loc = findPole(index, q);
    if (!loc) {
      toast.error(`Poste "${q}" não encontrado`);
      setHighlight(null);
      return;
    }
    // create new object reference to force highlight effect even on same pole
    setHighlight({ ...loc });
    toast.success(`Poste ${loc.poleNumber} localizado na página ${loc.page}`);
  }, [pdf, index]);

  const handleSelect = useCallback((loc: PoleLocation) => {
    setHighlight({ ...loc });
  }, []);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      <Header fileName={fileName} />

      {/* Search + upload bar */}
      <div className="surface flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="min-w-[260px] flex-1">
          <SearchBar onSearch={handleSearch} disabled={!pdf || indexing} />
        </div>
        {pdf && (
          <UploadArea
            compact
            onFile={loadPdf}
            loading={loading}
            indexing={indexing}
            progress={progress}
          />
        )}
        {pdf && hasStored && (
          <button
            onClick={async () => {
              await clearSaved();
              toast.success("PDF salvo removido");
            }}
            className="surface flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-[var(--transition-smooth)] hover:border-destructive/60 hover:text-destructive"
            title="Remover PDF salvo do navegador"
          >
            <Trash2 className="h-4 w-4" />
            Remover salvo
          </button>
        )}
        {highlight && (
          <div className="fade-in surface flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold">Poste {highlight.poleNumber}</span>
            <span className="text-muted-foreground">
              · pág. {highlight.page} · x:{highlight.x.toFixed(0)} y:{highlight.y.toFixed(0)}
            </span>
          </div>
        )}
      </div>

      {/* Main */}
      <div className="flex min-h-0 flex-1">
        {pdf && (
          <aside className="surface flex w-72 flex-col border-r border-border">
            <StatisticsPanel stats={stats} />
            <div className="min-h-0 flex-1 border-t border-border">
              <PoleList index={index} selected={highlight} onSelect={handleSelect} />
            </div>
          </aside>
        )}

        <main className="min-w-0 flex-1">
          {pdf ? (
            <PdfViewer pdf={pdf} highlight={highlight} />
          ) : (
            <UploadArea
              onFile={loadPdf}
              loading={loading}
              indexing={indexing}
              progress={progress}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default Index;
