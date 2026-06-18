import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pdfjsLib } from "@/lib/pdfjs";
import type { PDFDocumentProxy } from "@/lib/pdfjs";
import type { PdfIndex, PoleLocation, PoleStats } from "@/types/pole";
import { clearStoredPdf, loadStoredPdf, savePdf } from "@/lib/pdfStorage";

interface IndexProgress {
  current: number;
  total: number;
}

interface UsePdfIndexReturn {
  pdf: PDFDocumentProxy | null;
  index: PdfIndex;
  loading: boolean;
  indexing: boolean;
  progress: IndexProgress;
  error: string | null;
  fileName: string | null;
  stats: PoleStats;
  hasStored: boolean;
  restoring: boolean;
  loadPdf: (file: File) => Promise<void>;
  clearSaved: () => Promise<void>;
  reset: () => void;
}

// Match standalone numeric labels (1 to 6 digits). Avoids decimals, dates and big strings.
const POLE_REGEX = /^\d{1,6}$/;

function computeStats(index: PdfIndex): PoleStats {
  const keys = Object.keys(index);
  if (keys.length === 0) {
    return { total: 0, min: null, max: null, perPage: {} };
  }
  const nums = keys.map((k) => parseInt(k, 10)).filter((n) => !Number.isNaN(n));
  const perPage: Record<number, number> = {};
  for (const k of keys) {
    const p = index[k].page;
    perPage[p] = (perPage[p] ?? 0) + 1;
  }
  return {
    total: keys.length,
    min: nums.length ? Math.min(...nums) : null,
    max: nums.length ? Math.max(...nums) : null,
    perPage,
  };
}

export function usePdfIndex(): UsePdfIndexReturn {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [index, setIndex] = useState<PdfIndex>({});
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [progress, setProgress] = useState<IndexProgress>({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [hasStored, setHasStored] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const didInit = useRef(false);

  const reset = useCallback(() => {
    setPdf(null);
    setIndex({});
    setError(null);
    setFileName(null);
    setProgress({ current: 0, total: 0 });
  }, []);

  const processBuffer = useCallback(async (buffer: ArrayBuffer, name: string) => {
    setLoading(true);
    setError(null);
    setIndex({});
    setFileName(name);
    try {
      const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
      setPdf(doc);
      setLoading(false);
      setIndexing(true);
      setProgress({ current: 0, total: doc.numPages });

      const localIndex: PdfIndex = {};
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();
        for (const item of textContent.items as any[]) {
          const str: string = (item.str ?? "").trim();
          if (!str) continue;
          if (!POLE_REGEX.test(str)) continue;
          if (localIndex[str]) continue;
          const tx = item.transform[4] as number;
          const ty = item.transform[5] as number;
          const w = (item.width as number) ?? 0;
          const h = (item.height as number) ?? 0;
          localIndex[str] = {
            poleNumber: str,
            page: p,
            x: tx,
            y: ty,
            width: w,
            height: h,
            pageWidth: viewport.width,
            pageHeight: viewport.height,
          };
        }
        setProgress({ current: p, total: doc.numPages });
      }
      setIndex(localIndex);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Falha ao processar PDF");
      setPdf(null);
    } finally {
      setLoading(false);
      setIndexing(false);
    }
  }, []);

  const loadPdf = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    // Persist a copy first (pdf.js may detach the buffer we pass to it).
    try {
      await savePdf(file.name, buffer);
      setHasStored(true);
    } catch (e) {
      console.warn("Falha ao salvar PDF localmente", e);
    }
    await processBuffer(buffer.slice(0), file.name);
  }, [processBuffer]);

  const clearSaved = useCallback(async () => {
    try {
      await clearStoredPdf();
    } finally {
      setHasStored(false);
      reset();
    }
  }, [reset]);

  // Auto-restore stored PDF on mount.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    (async () => {
      try {
        const stored = await loadStoredPdf();
        if (stored) {
          setHasStored(true);
          await processBuffer(stored.data.slice(0), stored.name);
        }
      } catch (e) {
        console.warn("Falha ao restaurar PDF salvo", e);
      } finally {
        setRestoring(false);
      }
    })();
  }, [processBuffer]);

  const stats = useMemo(() => computeStats(index), [index]);

  return { pdf, index, loading, indexing, progress, error, fileName, stats, hasStored, restoring, loadPdf, clearSaved, reset };
}

export function findPole(index: PdfIndex, query: string): PoleLocation | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (index[trimmed]) return index[trimmed];
  // try numeric normalization (strip leading zeros)
  const normalized = String(parseInt(trimmed, 10));
  if (!Number.isNaN(parseInt(trimmed, 10)) && index[normalized]) return index[normalized];
  return null;
}
