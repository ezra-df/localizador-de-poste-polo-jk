import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Header } from "@/components/Header";
import { UploadArea } from "@/components/UploadArea";
import { PdfAnnotator } from "@/components/PdfAnnotator";
import {
  clearAnnotatorPdf, loadAnnotatorPdf, saveAnnotations, saveAnnotatorPdf,
} from "@/lib/annotatorStorage";
import { tryReadPersistedData } from "@/lib/pdfPersistence";

const Numerar = () => {
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);

  // Auto-restore previously saved annotator PDF.
  useEffect(() => {
    (async () => {
      try {
        const stored = await loadAnnotatorPdf();
        if (stored) {
          setBuffer(stored.data.slice(0));
          setFileName(stored.name);
        }
      } catch (e) {
        console.warn("Falha ao restaurar PDF do numerador", e);
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();

      // Se o PDF foi exportado anteriormente pelo app, contém o PDF original
      // anexado + as anotações em JSON. Nesse caso usamos o original como base
      // de trabalho (evita duplicação dos números ao reexportar).
      const persisted = await tryReadPersistedData(buf);
      const workingBuffer = persisted ? persisted.sourceBuffer : buf;

      if (persisted) {
        // Grava as anotações restauradas ANTES de montar o PdfAnnotator,
        // para que ele as carregue do localStorage por fileName.
        saveAnnotations(file.name, persisted.annotations);
        toast.success(
          `Edição restaurada: ${persisted.annotations.length} número(s) recuperados do PDF.`
        );
      }

      try { await saveAnnotatorPdf(file.name, workingBuffer); } catch (e) { console.warn(e); }
      setBuffer(workingBuffer.slice(0));
      setFileName(file.name);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao carregar PDF");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClear = async () => {
    await clearAnnotatorPdf();
    setBuffer(null);
    setFileName(null);
    toast.success("PDF do numerador removido");
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      <Header fileName={fileName} />

      <div className="surface flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <a
            href="/"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            ← Localizador
          </a>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-semibold">Numerar PDF</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {buffer && (
            <UploadArea compact onFile={handleFile} loading={loading} />
          )}
          {buffer && (
            <button
              onClick={handleClear}
              className="surface flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-[var(--transition-smooth)] hover:border-destructive/60 hover:text-destructive"
              title="Remover PDF salvo"
            >
              <Trash2 className="h-4 w-4" />
              Remover salvo
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {buffer && fileName ? (
          <PdfAnnotator pdfBuffer={buffer} fileName={fileName} />
        ) : restoring ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            Carregando…
          </div>
        ) : (
          <UploadArea onFile={handleFile} loading={loading} />
        )}
      </div>
    </div>
  );
};

export default Numerar;
