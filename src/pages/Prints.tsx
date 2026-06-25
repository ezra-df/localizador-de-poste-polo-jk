import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import JSZip from "jszip";
import { Download, ImageIcon, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Header } from "@/components/Header";
import { UploadArea } from "@/components/UploadArea";
import { pdfjsLib } from "@/lib/pdfjs";
import type { PDFDocumentProxy } from "@/lib/pdfjs";
import { clearStoredPdf, loadStoredPdf, savePdf } from "@/lib/pdfStorage";
import {
  DEFAULT_PRINTS_SETTINGS,
  PrintsSettings,
  aspectRatio,
  loadPrintsSettings,
  savePrintsSettings,
} from "@/lib/printsStorage";
import { Slider } from "@/components/ui/slider";

interface PoleHit {
  text: string;
  page: number;
  x: number; // PDF point coords of text center
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
}

interface GeneratedPrint {
  text: string;
  url: string;
  blob: Blob;
}

const ASPECTS = ["4:3", "1:1", "16:9", "3:4", "9:16"] as const;

const Prints = () => {
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);

  const [settings, setSettings] = useState<PrintsSettings>(DEFAULT_PRINTS_SETTINGS);
  const [hits, setHits] = useState<PoleHit[]>([]);
  const [scanning, setScanning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [prints, setPrints] = useState<GeneratedPrint[]>([]);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Restore stored PDF.
  useEffect(() => {
    (async () => {
      try {
        const stored = await loadStoredPdf();
        if (stored) { setBuffer(stored.data.slice(0)); setFileName(stored.name); }
      } catch (e) { console.warn(e); }
      finally { setRestoring(false); }
    })();
  }, []);

  // Open PDF when buffer changes.
  useEffect(() => {
    if (!buffer) { setPdf(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const doc = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
        if (!cancelled) setPdf(doc);
      } catch (e: any) {
        toast.error(e?.message ?? "Falha ao abrir PDF");
      }
    })();
    return () => { cancelled = true; };
  }, [buffer]);

  // Load settings for current file.
  useEffect(() => {
    setSettings(loadPrintsSettings(fileName));
  }, [fileName]);

  // Persist settings.
  useEffect(() => {
    if (fileName) savePrintsSettings(fileName, settings);
  }, [fileName, settings]);

  // Scan poles on pdf or filter change.
  useEffect(() => {
    if (!pdf) { setHits([]); return; }
    let cancelled = false;
    (async () => {
      setScanning(true);
      try {
        const regex = new RegExp(`^${escapeRegex(settings.prefix)}\\d{${settings.minDigits},}$`);
        const found: PoleHit[] = [];
        const seen = new Set<string>();
        for (let p = 1; p <= pdf.numPages; p++) {
          if (cancelled) return;
          const page = await pdf.getPage(p);
          const viewport = page.getViewport({ scale: 1 });
          const text = await page.getTextContent();
          for (const item of text.items as any[]) {
            const s: string = (item.str ?? "").trim();
            if (!s || !regex.test(s)) continue;
            if (seen.has(s)) continue;
            seen.add(s);
            const tx = item.transform[4] as number;
            const ty = item.transform[5] as number;
            const w = (item.width as number) ?? 0;
            const h = (item.height as number) ?? 0;
            found.push({
              text: s, page: p,
              x: tx + w / 2, y: ty + h / 2,
              width: w, height: h,
              pageWidth: viewport.width, pageHeight: viewport.height,
            });
          }
        }
        if (!cancelled) {
          found.sort((a, b) => a.text.localeCompare(b.text, undefined, { numeric: true }));
          setHits(found);
        }
      } finally {
        if (!cancelled) setScanning(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pdf, settings.prefix, settings.minDigits]);

  // Live preview rendering for first hit when settings change.
  useEffect(() => {
    if (!pdf || hits.length === 0) return;
    let cancelled = false;
    (async () => {
      const hit = hits[0];
      const blob = await renderCrop(pdf, hit, settings);
      if (cancelled) return;
      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
      };
      img.src = URL.createObjectURL(blob);
    })();
    return () => { cancelled = true; };
  }, [pdf, hits, settings]);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      try { await savePdf(file.name, buf); } catch (e) { console.warn(e); }
      setBuffer(buf.slice(0));
      setFileName(file.name);
      setPrints([]);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha");
    } finally { setLoading(false); }
  }, []);

  const handleClear = async () => {
    await clearStoredPdf();
    setBuffer(null); setFileName(null); setPdf(null); setHits([]); setPrints([]);
    toast.success("PDF removido");
  };

  const generateAll = async () => {
    if (!pdf || hits.length === 0) return;
    setGenerating(true);
    setProgress({ current: 0, total: hits.length });
    // free old object URLs
    prints.forEach(p => URL.revokeObjectURL(p.url));
    setPrints([]);

    try {
      // Group by page to render each page once at chosen DPI.
      const byPage = new Map<number, PoleHit[]>();
      for (const h of hits) {
        const arr = byPage.get(h.page) ?? [];
        arr.push(h); byPage.set(h.page, arr);
      }
      const out: GeneratedPrint[] = [];
      let done = 0;
      for (const [pageNum, list] of byPage) {
        const page = await pdf.getPage(pageNum);
        const scale = settings.dpi / 72;
        const viewport = page.getViewport({ scale });
        const fullCanvas = document.createElement("canvas");
        fullCanvas.width = Math.ceil(viewport.width);
        fullCanvas.height = Math.ceil(viewport.height);
        const ctx = fullCanvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport, canvas: fullCanvas } as any).promise;

        const cropWpdf = settings.zoom * viewport.width / scale; // PDF pts
        const cropHpdf = cropWpdf / aspectRatio(settings.aspect);
        const cropWpx = Math.round(cropWpdf * scale);
        const cropHpx = Math.round(cropHpdf * scale);

        for (const hit of list) {
          const cx = hit.x + settings.offsetX;
          const cy = hit.y + settings.offsetY;
          // PDF y is bottom-origin; canvas y is top-origin
          const [vx, vy] = viewport.convertToViewportPoint(cx, cy);
          const sx = Math.round(vx - cropWpx / 2);
          const sy = Math.round(vy - cropHpx / 2);

          const crop = document.createElement("canvas");
          crop.width = cropWpx; crop.height = cropHpx;
          const cctx = crop.getContext("2d")!;
          cctx.fillStyle = "#ffffff";
          cctx.fillRect(0, 0, cropWpx, cropHpx);
          cctx.drawImage(fullCanvas, sx, sy, cropWpx, cropHpx, 0, 0, cropWpx, cropHpx);

          const blob = await new Promise<Blob>((resolve) =>
            crop.toBlob((b) => resolve(b!), "image/jpeg", settings.quality)
          );
          out.push({ text: hit.text, blob, url: URL.createObjectURL(blob) });
          done++;
          setProgress({ current: done, total: hits.length });
        }
      }
      out.sort((a, b) => a.text.localeCompare(b.text, undefined, { numeric: true }));
      setPrints(out);
      toast.success(`${out.length} prints gerados`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar prints");
    } finally {
      setGenerating(false);
    }
  };

  const downloadZip = async () => {
    if (prints.length === 0) return;
    const zip = new JSZip();
    for (const p of prints) zip.file(`${p.text}.jpg`, p.blob);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(fileName ?? "prints").replace(/\.pdf$/i, "")}-prints.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const totalLabel = useMemo(() => {
    if (scanning) return "Procurando...";
    return `${hits.length} postes detectados`;
  }, [scanning, hits.length]);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      <Header fileName={fileName} />

      <div className="surface flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <span className="text-sm font-semibold">Gerar Prints</span>
        <div className="ml-auto flex items-center gap-2">
          {buffer && <UploadArea compact onFile={handleFile} loading={loading} />}
          {buffer && (
            <button
              onClick={handleClear}
              className="surface flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:border-destructive/60 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Remover salvo
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {!pdf ? (
          restoring ? (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">Carregando…</div>
          ) : (
            <UploadArea onFile={handleFile} loading={loading} />
          )
        ) : (
          <>
            {/* Settings sidebar */}
            <aside className="surface flex w-80 flex-col gap-4 overflow-y-auto border-r border-border p-4">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filtro de postes</h3>
                <label className="mb-1 block text-xs">Prefixo</label>
                <input
                  value={settings.prefix}
                  onChange={(e) => setSettings({ ...settings, prefix: e.target.value })}
                  className="mb-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  placeholder="P"
                />
                <label className="mb-1 block text-xs">Nº mínimo de dígitos: {settings.minDigits}</label>
                <Slider min={1} max={6} step={1} value={[settings.minDigits]}
                  onValueChange={([v]) => setSettings({ ...settings, minDigits: v })} />
                <div className="mt-2 text-xs text-muted-foreground">
                  {scanning ? <Loader2 className="inline h-3 w-3 animate-spin" /> : null} {totalLabel}
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Calibragem</h3>
                <label className="mb-1 block text-xs">Zoom (largura): {(settings.zoom * 100).toFixed(0)}% da página</label>
                <Slider min={0.03} max={0.6} step={0.005} value={[settings.zoom]}
                  onValueChange={([v]) => setSettings({ ...settings, zoom: v })} />

                <label className="mb-1 mt-3 block text-xs">Proporção</label>
                <div className="flex flex-wrap gap-1">
                  {ASPECTS.map(a => (
                    <button key={a}
                      onClick={() => setSettings({ ...settings, aspect: a })}
                      className={`rounded-md border px-2 py-1 text-xs ${settings.aspect === a ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                    >{a}</button>
                  ))}
                </div>

                <label className="mb-1 mt-3 block text-xs">Deslocamento X: {settings.offsetX.toFixed(0)}pt</label>
                <Slider min={-200} max={200} step={1} value={[settings.offsetX]}
                  onValueChange={([v]) => setSettings({ ...settings, offsetX: v })} />
                <label className="mb-1 mt-3 block text-xs">Deslocamento Y: {settings.offsetY.toFixed(0)}pt</label>
                <Slider min={-200} max={200} step={1} value={[settings.offsetY]}
                  onValueChange={([v]) => setSettings({ ...settings, offsetY: v })} />
              </div>

              <div className="border-t border-border pt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qualidade</h3>
                <label className="mb-1 block text-xs">DPI: {settings.dpi}</label>
                <Slider min={72} max={400} step={6} value={[settings.dpi]}
                  onValueChange={([v]) => setSettings({ ...settings, dpi: v })} />
                <label className="mb-1 mt-3 block text-xs">JPEG: {Math.round(settings.quality * 100)}%</label>
                <Slider min={0.4} max={1} step={0.05} value={[settings.quality]}
                  onValueChange={([v]) => setSettings({ ...settings, quality: v })} />
                <button
                  onClick={() => setSettings({ ...settings, dpi: 150, quality: 0.85 })}
                  className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="h-3 w-3" /> Preset 150 DPI / 85%
                </button>
              </div>

              <button
                onClick={generateAll}
                disabled={generating || scanning || hits.length === 0}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                {generating ? `Gerando ${progress.current}/${progress.total}` : `Gerar ${hits.length} prints`}
              </button>

              {prints.length > 0 && (
                <button
                  onClick={downloadZip}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/60 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
                >
                  <Download className="h-4 w-4" /> Baixar ZIP ({prints.length})
                </button>
              )}
            </aside>

            <main className="min-w-0 flex-1 overflow-y-auto p-4">
              <div className="mb-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Pré-visualização ({hits[0]?.text ?? "—"})
                </h3>
                <div className="surface inline-block max-w-full rounded-lg border border-border p-2">
                  <canvas ref={previewCanvasRef} className="max-h-[40vh] max-w-full rounded" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Ajuste o zoom, proporção e deslocamento até enquadrar bem. A calibragem é aplicada a todos os postes.
                </p>
              </div>

              {prints.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Galeria ({prints.length})
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {prints.map((p) => (
                      <a key={p.text} href={p.url} download={`${p.text}.jpg`}
                        className="surface group overflow-hidden rounded-lg border border-border hover:border-primary/60"
                      >
                        <img src={p.url} alt={p.text} className="aspect-[4/3] w-full object-cover" />
                        <div className="flex items-center justify-between px-2 py-1 text-xs">
                          <span className="font-medium">{p.text}</span>
                          <Download className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </main>
          </>
        )}
      </div>
    </div>
  );
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function renderCrop(pdf: PDFDocumentProxy, hit: PoleHit, settings: PrintsSettings): Promise<Blob> {
  const page = await pdf.getPage(hit.page);
  const scale = settings.dpi / 72;
  const viewport = page.getViewport({ scale });
  const cropWpdf = settings.zoom * viewport.width / scale;
  const cropHpdf = cropWpdf / aspectRatio(settings.aspect);
  const cropWpx = Math.round(cropWpdf * scale);
  const cropHpx = Math.round(cropHpdf * scale);

  // Render full page (could be optimized but preview uses only first hit)
  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = Math.ceil(viewport.width);
  fullCanvas.height = Math.ceil(viewport.height);
  const ctx = fullCanvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport, canvas: fullCanvas } as any).promise;

  const [vx, vy] = viewport.convertToViewportPoint(hit.x + settings.offsetX, hit.y + settings.offsetY);
  const sx = Math.round(vx - cropWpx / 2);
  const sy = Math.round(vy - cropHpx / 2);

  const crop = document.createElement("canvas");
  crop.width = cropWpx; crop.height = cropHpx;
  const cctx = crop.getContext("2d")!;
  cctx.fillStyle = "#fff";
  cctx.fillRect(0, 0, cropWpx, cropHpx);
  cctx.drawImage(fullCanvas, sx, sy, cropWpx, cropHpx, 0, 0, cropWpx, cropHpx);
  return await new Promise<Blob>((resolve) => crop.toBlob((b) => resolve(b!), "image/jpeg", settings.quality));
}

export default Prints;
