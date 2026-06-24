import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, Download, Maximize, Maximize2, Minus, Plus,
  Trash2, Undo2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { pdfjsLib } from "@/lib/pdfjs";
import type { PDFDocumentProxy } from "@/lib/pdfjs";
import type { AnnotationColor, AnnotationSettings, NumberAnnotation } from "@/types/annotation";
import { DEFAULT_SETTINGS } from "@/types/annotation";
import {
  loadAnnotations, loadSettings, saveAnnotations, saveSettings,
} from "@/lib/annotatorStorage";
import { exportAnnotatedPdf } from "@/lib/pdfExport";

interface PdfAnnotatorProps {
  pdfBuffer: ArrayBuffer; // raw bytes (kept around for export)
  fileName: string;
}

const MIN_SCALE = 0.3;
const MAX_SCALE = 6;
const CLICK_THRESHOLD_PX = 4;

const COLOR_CSS: Record<AnnotationColor, string> = {
  black: "#000000",
  red: "#d81b1b",
  blue: "#1a4dd8",
};

const COLOR_OPTIONS: { value: AnnotationColor; label: string }[] = [
  { value: "black", label: "Preto" },
  { value: "red", label: "Vermelho" },
  { value: "blue", label: "Azul" },
];

export function PdfAnnotator({ pdfBuffer, fileName }: PdfAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const viewportRef = useRef<any>(null); // current pdf.js viewport for the active page

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });

  const [settings, setSettings] = useState<AnnotationSettings>(DEFAULT_SETTINGS);
  const [annotations, setAnnotations] = useState<NumberAnnotation[]>([]);
  const undoStack = useRef<NumberAnnotation[][]>([]);

  const [exporting, setExporting] = useState(false);

  // Interaction state
  const dragMode = useRef<
    | { kind: "pan"; startX: number; startY: number; px: number; py: number; clickX: number; clickY: number }
    | { kind: "ann"; id: string; startX: number; startY: number }
    | null
  >(null);
  const [isPanning, setIsPanning] = useState(false);

  // Load pdf document from the buffer.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // pdf.js may detach the buffer, so feed it a copy.
      const doc = await pdfjsLib.getDocument({ data: pdfBuffer.slice(0) }).promise;
      if (!cancelled) setPdf(doc);
    })();
    return () => { cancelled = true; };
  }, [pdfBuffer]);

  // Restore persisted state for this file.
  useEffect(() => {
    setAnnotations(loadAnnotations(fileName));
    const s = loadSettings(fileName);
    if (s) setSettings({ ...DEFAULT_SETTINGS, ...s });
    undoStack.current = [];
  }, [fileName]);

  // Persist annotations & settings.
  useEffect(() => { saveAnnotations(fileName, annotations); }, [fileName, annotations]);
  useEffect(() => { saveSettings(fileName, settings); }, [fileName, settings]);

  // Render page.
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pageObj = await pdf.getPage(page);
      const baseRotation = pageObj.rotate ?? 0;
      const viewport = pageObj.getViewport({ scale, rotation: baseRotation });
      if (cancelled) return;
      viewportRef.current = viewport;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      setPageSize({ width: viewport.width, height: viewport.height });

      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch {} }
      const task = pageObj.render({ canvasContext: ctx, viewport, canvas });
      renderTaskRef.current = task;
      try { await task.promise; } catch {}
    })();
    return () => { cancelled = true; };
  }, [pdf, page, scale]);

  // Fit-to-screen on doc load / page change.
  const fitToScreen = useCallback(async () => {
    if (!pdf) return;
    const container = containerRef.current;
    if (!container) return;
    const pageObj = await pdf.getPage(page);
    const baseRotation = pageObj.rotate ?? 0;
    const v1 = pageObj.getViewport({ scale: 1, rotation: baseRotation });
    const cw = container.clientWidth - 32;
    const ch = container.clientHeight - 32;
    const s = Math.min(cw / v1.width, ch / v1.height);
    setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)));
    setPan({ x: 0, y: 0 });
  }, [pdf, page]);

  useEffect(() => { fitToScreen(); /* eslint-disable-next-line */ }, [pdf]);

  // Wheel zoom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const delta = -e.deltaY * 0.0015;
      setScale((prev) => {
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev * (1 + delta)));
        const ratio = next / prev;
        setPan((p) => ({
          x: mx - (mx - p.x) * ratio,
          y: my - (my - p.y) * ratio,
        }));
        return next;
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler as any);
  }, []);

  // Keyboard: Ctrl+Z undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushUndo = useCallback((snap: NumberAnnotation[]) => {
    undoStack.current.push(snap);
    if (undoStack.current.length > 50) undoStack.current.shift();
  }, []);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) {
      toast("Nada para desfazer");
      return;
    }
    setAnnotations(prev);
    // Reduce nextNumber if last was a sequential add — simplest heuristic: step backwards.
    setSettings((s) => ({ ...s, nextNumber: Math.max(0, s.nextNumber - s.step) }));
  }, []);

  // Convert a canvas-space CSS pixel coord (relative to canvas top-left) to PDF user space.
  const cssToPdf = useCallback((cssX: number, cssY: number): { x: number; y: number } => {
    const vp = viewportRef.current;
    if (!vp) return { x: 0, y: 0 };
    const [x, y] = vp.convertToPdfPoint(cssX, cssY);
    return { x, y };
  }, []);

  // Convert PDF user-space to css px (relative to canvas top-left).
  const pdfToCss = useCallback((pdfX: number, pdfY: number): { x: number; y: number } => {
    const vp = viewportRef.current;
    if (!vp) return { x: 0, y: 0 };
    const [x, y] = vp.convertToViewportPoint(pdfX, pdfY);
    return { x, y };
  }, []);

  const addAnnotationAtCss = (cssX: number, cssY: number) => {
    const { x, y } = cssToPdf(cssX, cssY);
    const text = `${settings.prefix}${settings.nextNumber}${settings.suffix}`;
    const newAnn: NumberAnnotation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      page,
      x,
      y,
      text,
      color: settings.color,
      fontSize: settings.fontSize,
    };
    pushUndo(annotations);
    setAnnotations((prev) => [...prev, newAnn]);
    setSettings((s) => ({ ...s, nextNumber: s.nextNumber + s.step }));
  };

  // Mouse handlers on the canvas wrapper.
  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;
    dragMode.current = {
      kind: "pan",
      startX: e.clientX,
      startY: e.clientY,
      px: pan.x,
      py: pan.y,
      clickX: e.clientX,
      clickY: e.clientY,
    };
    setIsPanning(true);
  };

  const onContainerMouseMove = (e: React.MouseEvent) => {
    const m = dragMode.current;
    if (!m) return;
    if (m.kind === "pan") {
      setPan({
        x: m.px + (e.clientX - m.startX),
        y: m.py + (e.clientY - m.startY),
      });
    } else if (m.kind === "ann") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      // Convert to canvas CSS coordinates (rect is already affected by transforms, so use displayed size).
      // Because rect reflects the rendered size 1:1 with pageSize, this is fine.
      const { x, y } = cssToPdf(
        (cssX / rect.width) * pageSize.width,
        (cssY / rect.height) * pageSize.height
      );
      setAnnotations((prev) => prev.map((a) => (a.id === m.id ? { ...a, x, y } : a)));
    }
  };

  const onContainerMouseUp = (e: React.MouseEvent) => {
    const m = dragMode.current;
    dragMode.current = null;
    setIsPanning(false);
    if (!m) return;
    if (m.kind === "pan") {
      const dx = Math.abs(e.clientX - m.clickX);
      const dy = Math.abs(e.clientY - m.clickY);
      if (dx <= CLICK_THRESHOLD_PX && dy <= CLICK_THRESHOLD_PX) {
        // Treat as click on canvas: add annotation at this point.
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (
          e.clientX < rect.left || e.clientX > rect.right ||
          e.clientY < rect.top || e.clientY > rect.bottom
        ) return;
        const cssX = (e.clientX - rect.left) * (pageSize.width / rect.width);
        const cssY = (e.clientY - rect.top) * (pageSize.height / rect.height);
        addAnnotationAtCss(cssX, cssY);
      }
    }
  };

  const startDragAnnotation = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    pushUndo(annotations);
    dragMode.current = { kind: "ann", id, startX: e.clientX, startY: e.clientY };
  };

  const editAnnotation = (id: string) => {
    const ann = annotations.find((a) => a.id === id);
    if (!ann) return;
    const next = window.prompt("Editar texto do número:", ann.text);
    if (next == null) return;
    pushUndo(annotations);
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, text: next } : a)));
  };

  const deleteAnnotation = (id: string) => {
    pushUndo(annotations);
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  };

  const clearPage = () => {
    if (!window.confirm(`Remover todos os números da página ${page}?`)) return;
    pushUndo(annotations);
    setAnnotations((prev) => prev.filter((a) => a.page !== page));
  };

  const clearAll = () => {
    if (!window.confirm("Remover TODOS os números de todas as páginas?")) return;
    pushUndo(annotations);
    setAnnotations([]);
  };

  const handleExport = async () => {
    if (annotations.length === 0) {
      toast.error("Nenhum número inserido para exportar.");
      return;
    }
    setExporting(true);
    try {
      const base = fileName.replace(/\.pdf$/i, "");
      await exportAnnotatedPdf(pdfBuffer, annotations, `${base}-numerado.pdf`);
      toast.success("PDF numerado exportado.");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Falha ao exportar PDF.");
    } finally {
      setExporting(false);
    }
  };

  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, s * 1.25));
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, s / 1.25));
  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => pdf && setPage((p) => Math.min(pdf.numPages, p + 1));

  const toggleFullscreen = () => {
    const el = containerRef.current?.parentElement?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const pageAnnotations = annotations.filter((a) => a.page === page);

  if (!pdf) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Carregando PDF...
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* Top toolbar: settings */}
      <div className="surface flex flex-wrap items-center gap-3 border-b border-border px-3 py-2 text-sm">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Próximo nº</label>
          <Input
            type="number"
            className="h-8 w-24"
            value={settings.nextNumber}
            onChange={(e) => setSettings((s) => ({ ...s, nextNumber: parseInt(e.target.value || "0", 10) }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Passo</label>
          <Input
            type="number"
            className="h-8 w-16"
            value={settings.step}
            min={1}
            onChange={(e) => setSettings((s) => ({ ...s, step: Math.max(1, parseInt(e.target.value || "1", 10)) }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Prefixo</label>
          <Input
            className="h-8 w-20"
            value={settings.prefix}
            placeholder="P-"
            onChange={(e) => setSettings((s) => ({ ...s, prefix: e.target.value }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Sufixo</label>
          <Input
            className="h-8 w-20"
            value={settings.suffix}
            onChange={(e) => setSettings((s) => ({ ...s, suffix: e.target.value }))}
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Cor</label>
          <div className="flex gap-1">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c.value}
                onClick={() => setSettings((s) => ({ ...s, color: c.value }))}
                title={c.label}
                className={`h-7 w-7 rounded-md border-2 transition-all ${
                  settings.color === c.value ? "border-primary scale-110" : "border-border"
                }`}
                style={{ backgroundColor: COLOR_CSS[c.value] }}
              />
            ))}
          </div>
        </div>

        <div className="flex min-w-[180px] items-center gap-2">
          <label className="text-xs text-muted-foreground">Tamanho</label>
          <Slider
            value={[settings.fontSize]}
            min={8}
            max={48}
            step={1}
            onValueChange={([v]) => setSettings((s) => ({ ...s, fontSize: v }))}
            className="w-32"
          />
          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
            {settings.fontSize}pt
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">
            Próx: <span style={{ color: COLOR_CSS[settings.color] }}>
              {settings.prefix}{settings.nextNumber}{settings.suffix}
            </span>
          </span>
          <Button size="sm" variant="ghost" onClick={undo} title="Desfazer (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={clearPage} title="Limpar página">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleExport} disabled={exporting}>
            <Download className="mr-1.5 h-4 w-4" />
            {exporting ? "Exportando..." : "Exportar PDF"}
          </Button>
        </div>
      </div>

      {/* Page nav + zoom */}
      <div className="surface flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={goPrev} disabled={page <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[80px] text-center text-sm tabular-nums text-muted-foreground">
            {page} / {pdf.numPages}
          </span>
          <Button size="icon" variant="ghost" onClick={goNext} disabled={page >= pdf.numPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="mx-2 h-5 w-px bg-border" />
          <span className="text-xs text-muted-foreground">
            {pageAnnotations.length} nesta pág. · {annotations.length} no total
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={zoomOut}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="min-w-[60px] text-center text-sm tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <Button size="icon" variant="ghost" onClick={zoomIn}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={fitToScreen} title="Ajustar à tela">
            <Maximize className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={toggleFullscreen} title="Tela cheia">
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={clearAll} title="Limpar tudo">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden select-none"
        style={{ cursor: isPanning ? "grabbing" : "crosshair" }}
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onContainerMouseMove}
        onMouseUp={onContainerMouseUp}
        onMouseLeave={() => {
          if (dragMode.current) { dragMode.current = null; setIsPanning(false); }
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            width: pageSize.width,
            height: pageSize.height,
          }}
        >
          <canvas ref={canvasRef} className="block rounded shadow-[0_0_0_1px_hsl(var(--border))]" />

          {/* Annotation overlays */}
          {pageAnnotations.map((a) => {
            const css = pdfToCss(a.x, a.y);
            return (
              <div
                key={a.id}
                className="group pointer-events-auto absolute"
                style={{
                  left: css.x,
                  top: css.y,
                  transform: "translate(-50%, -50%)",
                }}
                onMouseDown={(e) => startDragAnnotation(e, a.id)}
                onDoubleClick={(e) => { e.stopPropagation(); editAnnotation(a.id); }}
                title="Arraste para mover · duplo-clique para editar"
              >
                <span
                  className="select-none whitespace-nowrap font-bold leading-none"
                  style={{
                    color: COLOR_CSS[a.color],
                    fontSize: a.fontSize * scale,
                    textShadow:
                      "0 0 2px #fff, 0 0 2px #fff, 0 0 2px #fff, 0 0 2px #fff",
                    cursor: "move",
                  }}
                >
                  {a.text}
                </span>
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); deleteAnnotation(a.id); }}
                  className="absolute -right-3 -top-3 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow group-hover:flex"
                  title="Excluir"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Helper hint */}
        <div className="surface pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          Clique para inserir · arraste para mover o mapa · scroll para zoom · duplo-clique no número para editar
        </div>
      </div>
    </div>
  );
}
