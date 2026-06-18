import { useCallback, useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadAreaProps {
  onFile: (file: File) => void;
  loading?: boolean;
  indexing?: boolean;
  progress?: { current: number; total: number };
  compact?: boolean;
}

export function UploadArea({ onFile, loading, indexing, progress, compact }: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handle = useCallback((f: File | undefined | null) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) return;
    onFile(f);
  }, [onFile]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handle(e.dataTransfer.files?.[0]);
  };

  const busy = loading || indexing;
  const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  if (compact) {
    return (
      <>
        <button
          onClick={() => inputRef.current?.click()}
          className="surface flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-[var(--transition-smooth)] hover:border-primary/60 hover:text-primary"
          disabled={busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          {busy ? `Indexando ${pct}%` : "Trocar PDF"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => handle(e.target.files?.[0])}
        />
      </>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "surface group w-full max-w-xl cursor-pointer rounded-2xl border-2 border-dashed border-border p-12 text-center transition-[var(--transition-smooth)]",
          dragOver && "border-primary bg-primary/5",
          busy && "pointer-events-none opacity-80"
        )}
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
          {busy ? <Loader2 className="h-7 w-7 animate-spin" /> : <FileUp className="h-7 w-7" />}
        </div>
        <h2 className="mb-2 text-lg font-semibold">
          {loading && "Carregando PDF..."}
          {indexing && `Indexando postes... ${pct}%`}
          {!busy && "Arraste a planta elétrica ou clique para selecionar"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {busy
            ? `Página ${progress?.current ?? 0} de ${progress?.total ?? 0}`
            : "Arquivos PDF processados 100% no seu navegador. Nada é enviado."}
        </p>
        {indexing && (
          <div className="mx-auto mt-6 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => handle(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
