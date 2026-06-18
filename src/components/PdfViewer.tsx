import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minus, Plus, RotateCcw, RotateCw, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PDFDocumentProxy } from "@/lib/pdfjs";
import type { PoleLocation } from "@/types/pole";
import { loadRotations, saveRotations, type RotationMap } from "@/lib/rotationStorage";

interface PdfViewerProps {
  pdf: PDFDocumentProxy;
  highlight: PoleLocation | null;
  fileName: string | null;
}

interface PanState {
  x: number;
  y: number;
}

const MIN_SCALE = 0.3;
const MAX_SCALE = 6;

export function PdfViewer({ pdf, highlight, fileName }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);

  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<PanState>({ x: 0, y: 0 });
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // Per-page rotations, restored from localStorage for this file.
  const [rotations, setRotations] = useState<RotationMap>({});
  useEffect(() => {
    setRotations(loadRotations(fileName));
  }, [fileName]);

  const rotation = ((rotations[page] ?? 0) % 360 + 360) % 360;

  // Render current page (applying user rotation on top of the page's own rotation)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pageObj = await pdf.getPage(page);
      const baseRotation = pageObj.rotate ?? 0;
      const viewport = pageObj.getViewport({ scale, rotation: (baseRotation + rotation) % 360 });
      if (cancelled) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      setPageSize({ width: viewport.width, height: viewport.height });

      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }
      const task = pageObj.render({ canvasContext: ctx, viewport, canvas });
      renderTaskRef.current = task;
      try { await task.promise; } catch {}
    })();
    return () => { cancelled = true; };
  }, [pdf, page, scale, rotation]);

  // Fit-to-screen helper
  const fitToScreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    const pageObj = await pdf.getPage(page);
    const baseRotation = pageObj.rotate ?? 0;
    const v1 = pageObj.getViewport({ scale: 1, rotation: (baseRotation + rotation) % 360 });
    const cw = container.clientWidth - 32;
    const ch = container.clientHeight - 32;
    const s = Math.min(cw / v1.width, ch / v1.height);
    setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)));
    setPan({ x: 0, y: 0 });
  }, [pdf, page, rotation]);

  // Initial fit
  useEffect(() => {
    fitToScreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf]);

  // Compute viewport point for a highlight, honoring rotation.
  const computeHighlightPoint = useCallback(async (h: PoleLocation, atScale: number) => {
    const pageObj = await pdf.getPage(h.page);
    const baseRotation = pageObj.rotate ?? 0;
    const rot = ((rotations[h.page] ?? 0) + baseRotation) % 360;
    const vp = pageObj.getViewport({ scale: atScale, rotation: rot });
    const [vx, vy] = vp.convertToViewportPoint(h.x, h.y);
    return { x: vx, y: vy, width: vp.width, height: vp.height };
  }, [pdf, rotations]);

  // Handle highlight changes: jump to page, zoom, center
  useEffect(() => {
    if (!highlight) return;
    (async () => {
      setPage(highlight.page);
      const container = containerRef.current;
      if (!container) return;
      const targetScale = 2.5;
      setScale(targetScale);
      const pt = await computeHighlightPoint(highlight, targetScale);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          setPan({ x: cw / 2 - pt.x, y: ch / 2 - pt.y });
        });
      });
    })();
  }, [highlight, computeHighlightPoint]);

  // Highlight marker position in canvas px (synchronous fallback assuming current viewport)
  const [highlightPx, setHighlightPx] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!highlight || highlight.page !== page) {
      setHighlightPx(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const pt = await computeHighlightPoint(highlight, scale);
      if (!cancelled) setHighlightPx({ x: pt.x, y: pt.y });
    })();
    return () => { cancelled = true; };
  }, [highlight, page, scale, rotation, computeHighlightPoint]);

  // Wheel zoom (native listener for passive:false)
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

  const onMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStart.current) return;
    setPan({
      x: dragStart.current.px + (e.clientX - dragStart.current.x),
      y: dragStart.current.py + (e.clientY - dragStart.current.y),
    });
  };
  const stopDrag = () => setIsDragging(false);

  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, s * 1.25));
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, s / 1.25));

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(pdf.numPages, p + 1));

  const rotateBy = (delta: number) => {
    setRotations((prev) => {
      const current = prev[page] ?? 0;
      const next = (((current + delta) % 360) + 360) % 360;
      const updated: RotationMap = { ...prev, [page]: next };
      saveRotations(fileName, updated);
      return updated;
    });
    setPan({ x: 0, y: 0 });
  };

  const toggleFullscreen = () => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  const showHighlight = highlight && highlight.page === page && highlightPx;

  return (
    <div className="relative flex h-full w-full flex-col bg-background">
      {/* Toolbar */}
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
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => rotateBy(-90)} title="Girar 90° à esquerda">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <span
            className="min-w-[48px] text-center text-xs tabular-nums text-muted-foreground"
            title="Rotação aplicada nesta página (salva)"
          >
            {rotation}°
          </span>
          <Button size="icon" variant="ghost" onClick={() => rotateBy(90)} title="Girar 90° à direita">
            <RotateCw className="h-4 w-4" />
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
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
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden select-none"
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
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

          {showHighlight && (
            <div
              className="pointer-events-none absolute fade-in"
              style={{ left: highlightPx!.x, top: highlightPx!.y, transform: "translate(-50%, -50%)" }}
            >
              <div className="pulse-ring h-14 w-14 rounded-full border-2 border-destructive bg-destructive/10" />
              <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-destructive px-2 py-1 text-xs font-bold text-destructive-foreground shadow-lg">
                Poste {highlight!.poleNumber}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
